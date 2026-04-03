🟣 从开启 Quiz + 打开盲人模式开始
第 1 步：Quiz Overview 页面

用户打开：

Accessibility (Blind Mode) → 打开 Switch
此时系统发生什么？

✅ 启用：

键盘监听

TTS

Ctrl + A 视觉辅助

❌ 不做：

不申请麦克风权限

不启动录音

不创建 MediaRecorder

👉 麦克风状态：完全未激活

🔵 第 2 步：进入 MCQ 页面

此时：

可以按 1–4 选答案

可以 Ctrl + A 打开 AI 侧栏

但：

🎤 麦克风依然是：

idle / not initialized

因为选择题不需要语音输入。

🟣 第 3 步：进入 Short Answer 页面（Q6）

现在才出现语音输入场景。

此时麦克风仍然：

未启动
未请求权限

UI 上只是：

紫色麦克风图标

提示：Hold Space to dictate

它只是视觉提示，不是真实监听。

🔴 第 4 步：真正启动麦克风的瞬间

只有在：

keydown Space
AND blindMode === true
AND screen === "sa"

才执行：

navigator.mediaDevices.getUserMedia({ audio: true })

然后：

startRecording()
setRecording(true)

UI：

麦克风变红

Pulse 动画

TTS 停止播放（避免回声）

🔴 第 5 步：松开 Space
keyup Space

执行：

stopRecording()
setRecording(false)
saveAudio()
TTS("Audio saved successfully")

然后：

🎤 麦克风立即关闭
流被销毁
不再监听