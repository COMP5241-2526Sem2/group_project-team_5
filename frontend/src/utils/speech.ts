import { useState, useEffect, useRef, useCallback } from 'react';

// ─── TTS status for diagnostics ───────────────────────────────────────────────
export type TTSStatus = 'unsupported' | 'no-voices' | 'idle' | 'speaking';

// ─── TTS (Text-to-Speech) Hook ───────────────────────────────────────────────
export function useTTS({ rate = 0.95 }: { rate?: number } = {}) {
  const [isSpeaking, setIsSpeaking]     = useState(false);
  const [ttsStatus, setTtsStatus]       = useState<TTSStatus>('idle');
  const queueRef                        = useRef<string[]>([]);
  const rateRef                         = useRef(rate);
  const heartbeatRef                    = useRef<ReturnType<typeof setInterval> | null>(null);
  // Pending text queued before voices were ready
  const pendingRef                      = useRef<string | null>(null);
  const voicesReadyRef                  = useRef(false);

  useEffect(() => { rateRef.current = rate; }, [rate]);

  // ── Heartbeat: prevents Chrome auto-pause on long utterances ──────────────
  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
  }, []);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatRef.current = setInterval(() => {
      if ('speechSynthesis' in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 10_000);
  }, [stopHeartbeat]);

  // ── speakNow: actually calls speechSynthesis.speak() — FULLY SYNCHRONOUS ──
  //
  // ⚠ Never call this via Promise/setTimeout/microtask — the call must happen
  //   in the SAME synchronous stack as the user gesture (click / keydown),
  //   otherwise Chrome sandboxed iframes reject it silently.
  //
  const speakNow = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();

    const utterance     = new SpeechSynthesisUtterance(text);
    utterance.rate      = rateRef.current;
    utterance.pitch     = 1.0;
    utterance.volume    = 1.0;
    utterance.lang      = 'en-US';

    // Prefer a local en-US voice when available; omit otherwise (use default)
    const voices  = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang === 'en-US' && v.localService)
                  ?? voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utterance.voice = enVoice;

    utterance.onstart = () => { setIsSpeaking(true); setTtsStatus('speaking'); startHeartbeat(); };
    utterance.onend   = () => {
      setIsSpeaking(false);
      const next = queueRef.current.shift();
      if (next) { speakNow(next); }
      else      { setTtsStatus('idle'); stopHeartbeat(); }
    };
    utterance.onerror = (e) => {
      // 'interrupted' / 'canceled' are expected when cancel() is called — ignore
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('[TTS] error:', e.error);
      }
      setIsSpeaking(false);
      setTtsStatus('idle');
      stopHeartbeat();
    };

    window.speechSynthesis.speak(utterance);
  }, [startHeartbeat, stopHeartbeat]);

  // ── Pre-warm voices on mount ───────────────────────────────────────────────
  // Chrome loads voices asynchronously. We kick off loading here so that by
  // the time the user clicks anything, voices are already ready. If voices are
  // already available (subsequent renders / hot reload), we mark ready now.
  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setTtsStatus('unsupported');
      return;
    }
    const checkVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        voicesReadyRef.current = true;
        setTtsStatus('idle');
        // If speak() was called before voices loaded, fire now
        if (pendingRef.current) {
          const text = pendingRef.current;
          pendingRef.current = null;
          speakNow(text);
        }
      }
    };
    checkVoices(); // immediate check
    window.speechSynthesis.addEventListener('voiceschanged', checkVoices);
    // Safety: mark ready after 3 s regardless (some browsers never fire voiceschanged)
    const fallback = setTimeout(() => {
      if (!voicesReadyRef.current) {
        voicesReadyRef.current = true;
        if (pendingRef.current) { const t = pendingRef.current; pendingRef.current = null; speakNow(t); }
      }
    }, 3000);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', checkVoices);
      clearTimeout(fallback);
    };
  }, [speakNow]);

  // ── speak(): SYNCHRONOUS entry point ─────────────────────────────────────
  //
  // If voices are ready → speakNow() immediately in the same call stack.
  // If voices aren't ready yet → store text in pendingRef; the voiceschanged
  //   listener above will fire speakNow() once they load.
  //
  // Either way: NO Promise, NO setTimeout, NO microtask on the hot path.
  //
  const speak = useCallback((text: string, thenQueue?: string) => {
    if (!('speechSynthesis' in window)) {
      console.warn('[TTS] speechSynthesis not available in this environment');
      setTtsStatus('unsupported');
      return;
    }
    window.speechSynthesis.cancel();
    stopHeartbeat();
    setIsSpeaking(false);
    queueRef.current = thenQueue !== undefined ? [thenQueue] : [];

    if (voicesReadyRef.current) {
      speakNow(text);   // ← synchronous — stays in user-gesture call stack
    } else {
      // Voices not ready yet: queue text; the mount effect will call speakNow
      setTtsStatus('no-voices');
      pendingRef.current = text;
      // Also trigger getVoices() here in case the event fires immediately
      window.speechSynthesis.getVoices();
    }
  }, [speakNow, stopHeartbeat]);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      queueRef.current   = [];
      pendingRef.current = null;
      setIsSpeaking(false);
      setTtsStatus('idle');
      stopHeartbeat();
    }
  }, [stopHeartbeat]);

  // ── queue(): append + start if idle (used by AI Vision streaming) ─────────
  const queue = useCallback((text: string) => {
    queueRef.current.push(text);
    if (!isSpeaking) {
      const next = queueRef.current.shift();
      if (next) speakNow(next);
    }
  }, [isSpeaking, speakNow]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      stopHeartbeat();
    };
  }, [stopHeartbeat]);

  return { speak, stop, queue, isSpeaking, ttsStatus };
}

// ─── Microphone Permission Helper ────────────────────────────────────────────
export type MicPermission = 'unknown' | 'granted' | 'denied' | 'unsupported';

/**
 * Request microphone access and return whether it was granted.
 * Resolves to true on success, false on denial.
 */
export async function requestMicPermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop tracks immediately — we only needed the permission prompt
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}

/** Query current permission state without prompting */
export async function queryMicPermission(): Promise<MicPermission> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  if (!navigator.permissions) return 'unknown';
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state as MicPermission;
  } catch {
    return 'unknown';
  }
}

// ─── STT (Speech-to-Text) Hook ───────────────────────────────────────────────
export function useSTT() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micPermission, setMicPermission] = useState<MicPermission>('unknown');
  const recognitionRef = useRef<any>(null);
  const supportedRef = useRef(false);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      console.warn('Speech Recognition not supported');
      setMicPermission('unsupported');
      return;
    }
    supportedRef.current = true;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setMicPermission('granted');
    };

    recognition.onend = () => setIsListening(false);

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        setMicPermission('denied');
        console.warn('Microphone access denied. Enable it in browser settings to use voice commands.');
      } else if (event.error === 'no-speech' || event.error === 'aborted') {
        // non-fatal — ignore
      } else {
        console.warn('Speech recognition error:', event.error);
      }
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const part = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += part + ' ';
        else interim += part;
      }
      setInterimTranscript(interim);
      if (final) setTranscript(prev => (prev + ' ' + final).trim());
    };

    recognitionRef.current = recognition;

    return () => {
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!supportedRef.current || !recognitionRef.current || isListening) return;

    // Check/request permission first
    const perm = await queryMicPermission();
    if (perm === 'denied') {
      setMicPermission('denied');
      return;
    }
    if (perm === 'unknown' || perm === 'granted') {
      setTranscript('');
      setInterimTranscript('');
      try {
        recognitionRef.current.start();
      } catch (err: any) {
        // InvalidStateError means already started — safe to ignore
        if (err?.name !== 'InvalidStateError') {
          console.warn('Failed to start recognition:', err);
        }
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    micPermission,
    startListening,
    stopListening,
    resetTranscript,
  };
}

// ─── Command Parser ──────────────────────────────────────────────────────────
export type VoiceCommand =
  | { type: 'answer'; value: 'A' | 'B' | 'C' | 'D' }
  | { type: 'confirm' }
  | { type: 'change' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'goto'; questionNumber: number }
  | { type: 'repeat' }
  | { type: 'stop' }
  | { type: 'myAnswer' }
  | { type: 'submit' }
  | { type: 'confirmSubmit' }
  | { type: 'cancel' }
  | { type: 'help' }
  | { type: 'start' }
  | { type: 'close' }
  | { type: 'review' }
  | { type: 'unknown' };

export function parseVoiceCommand(text: string): VoiceCommand {
  const normalized = text.toLowerCase().trim();

  if (/^[a]$|^option a$|^choice a$/i.test(normalized)) return { type: 'answer', value: 'A' };
  if (/^[b]$|^option b$|^choice b$/i.test(normalized)) return { type: 'answer', value: 'B' };
  if (/^[c]$|^option c$|^choice c$/i.test(normalized)) return { type: 'answer', value: 'C' };
  if (/^[d]$|^option d$|^choice d$/i.test(normalized)) return { type: 'answer', value: 'D' };

  if (/^confirm$/i.test(normalized)) return { type: 'confirm' };
  if (/^change$|^modify$|^edit$/i.test(normalized)) return { type: 'change' };

  if (/^next$/i.test(normalized)) return { type: 'next' };
  if (/^previous$|^prev$|^back$/i.test(normalized)) return { type: 'previous' };

  const gotoMatch = normalized.match(/^go to question (\d+)$/);
  if (gotoMatch) {
    const num = parseInt(gotoMatch[1], 10);
    if (num >= 1 && num <= 6) return { type: 'goto', questionNumber: num };
  }

  if (/^repeat$|^read again$|^say again$/i.test(normalized)) return { type: 'repeat' };
  if (/^stop$|^stop reading$/i.test(normalized)) return { type: 'stop' };
  if (/^my answer$|^what did i answer$|^current answer$/i.test(normalized)) return { type: 'myAnswer' };
  if (/^submit$/i.test(normalized)) return { type: 'submit' };
  if (/^confirm submit$/i.test(normalized)) return { type: 'confirmSubmit' };
  if (/^cancel$/i.test(normalized)) return { type: 'cancel' };
  if (/^help$/i.test(normalized)) return { type: 'help' };
  if (/^start$/i.test(normalized)) return { type: 'start' };
  if (/^close$/i.test(normalized)) return { type: 'close' };
  if (/^review$/i.test(normalized)) return { type: 'review' };

  return { type: 'unknown' };
}

// ─── Audio Recorder Hook ─────────────────────────────────────────────────────
export interface AudioRecording {
  blob: Blob;
  duration: number;
  contentType: string;
}

/** Pick the first MIME type the browser supports, or fall back to no hint */
function getSupportedMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [micPermission, setMicPermission] = useState<MicPermission>('unknown');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    if (isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicPermission('unsupported');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
    } catch (err: any) {
      const isDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        err?.message?.toLowerCase().includes('permission');
      setMicPermission(isDenied ? 'denied' : 'unknown');
      // Silently skip — no console.error spam
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    startTimeRef.current = Date.now();

    const mimeType = getSupportedMimeType();
    const options = mimeType ? { mimeType } : undefined;
    const mediaRecorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = () => {
      const duration = Date.now() - startTimeRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      setRecordings(prev => [...prev, { blob, duration, contentType: mimeType || 'audio/webm' }]);
      stream.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, [isRecording]);

  const clearRecordings = useCallback(() => setRecordings([]), []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return { isRecording, recordings, micPermission, startRecording, stopRecording, clearRecordings };
}