import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import TeacherLayout from '../../components/teacher/TeacherLayout';
import { teacherKeys } from '../../query/teacherKeys';
import {
  Plus, Search, BookOpen, Sparkles, Upload, Edit3, Eye, Clock, CheckCircle2, FileText,
  MoreHorizontal,
} from 'lucide-react';
import { CustomSelect } from '../../components/teacher/CustomSelect';
import { lessonsApi, type LessonListItemApi } from '../../api/lessons';

const SUBJECT_STYLE: Record<string, { bg: string; color: string; dot: string; emoji: string }> = {
  math:      { bg: '#eff6ff', color: '#1e40af', dot: '#3b5bdb', emoji: '📐' },
  physics:   { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b', emoji: '⚡' },
  chemistry: { bg: '#fdf4ff', color: '#6b21a8', dot: '#a855f7', emoji: '⚗️' },
  biology:   { bg: '#f0fdf4', color: '#166534', dot: '#22c55e', emoji: '🔬' },
};
function ss(s: string) { return SUBJECT_STYLE[s] ?? { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af', emoji: '📄' }; }

const SOURCE_LABEL: Record<string, string> = {
  kb_ai: 'AI Generated', ppt_import: 'PPT Import', manual: 'Manual', hybrid: 'Hybrid',
};

function formatDate(iso: string) {
  try {
    return iso.slice(0, 10);
  } catch {
    return iso;
  }
}

export default function TeacherLessons() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: lessonsPage,
    isPending: loading,
    isError,
    error: lessonsErr,
  } = useQuery({
    queryKey: teacherKeys.lessonsList(1, 100),
    queryFn: () => lessonsApi.list({ page: 1, page_size: 100 }),
  });
  const decks = lessonsPage?.items ?? [];
  const listError = isError ? (lessonsErr instanceof Error ? lessonsErr.message : 'Failed to load lessons') : null;
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [filterSubject, setFilterSubject] = useState('All Subjects');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (openMenuId === null) return;
    function onDocClick(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest('[data-lesson-menu-wrap]');
      const wid = el?.getAttribute('data-lesson-menu-wrap');
      if (wid && Number(wid) === openMenuId) return;
      setOpenMenuId(null);
    }
    const t = window.setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('click', onDocClick);
    };
  }, [openMenuId]);

  const filtered = decks.filter(d =>
    (!search || d.title.toLowerCase().includes(search.toLowerCase())) &&
    (filterStatus === 'all' || d.status === filterStatus) &&
    (filterSubject === 'All Subjects' || d.subject === filterSubject)
  );

  const publishCount = decks.filter(d => d.status === 'published').length;
  const draftCount   = decks.filter(d => d.status === 'draft').length;
  const subjectCount = new Set(decks.map(d => d.subject)).size;

  async function handleNewLesson() {
    try {
      setBusyId(-1);
      const created = await lessonsApi.create({ title: 'Untitled lesson', subject: 'physics' });
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'lessons'] });
      navigate(`/teacher/lesson-editor/${created.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not create lesson');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (deleteId == null) return;
    try {
      setBusyId(deleteId);
      await lessonsApi.remove(deleteId);
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'lessons'] });
      setDeleteId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  async function publishDeck(id: number) {
    try {
      setBusyId(id);
      await lessonsApi.patchStatus(id, 'published');
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'lessons'] });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  async function rollbackDeck(id: number) {
    try {
      setBusyId(id);
      await lessonsApi.patchStatus(id, 'draft');
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'lessons'] });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Rollback failed');
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  return (
    <TeacherLayout>
      <div style={{ padding: '24px 28px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: '1100px' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '22px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f0f23', margin: '0 0 4px' }}>Interactive Lessons</h1>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Manage courseware with embedded Lab components</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              disabled
              title="Coming soon — use New Lesson for now"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1px solid #e8eaed', borderRadius: '8px',
                background: '#f3f4f6', color: '#9ca3af', fontSize: '13px', cursor: 'not-allowed', opacity: 0.85,
              }}
            >
              <Upload size={14} /> Import PPT
            </button>
            <button
              type="button"
              onClick={handleNewLesson}
              disabled={busyId !== null}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', border: 'none', borderRadius: '8px', background: '#3b5bdb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: busyId !== null ? 'wait' : 'pointer', opacity: busyId !== null ? 0.7 : 1 }}
            >
              <Plus size={14} /> New Lesson
            </button>
          </div>
        </div>

        {listError && (
          <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#991b1b' }}>
            {listError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Total Lessons', value: loading ? '…' : decks.length, icon: BookOpen, color: '#3b5bdb', bg: '#eff6ff' },
            { label: 'Published',     value: loading ? '…' : publishCount, icon: CheckCircle2, color: '#059669', bg: '#f0fdf4' },
            { label: 'Drafts',        value: loading ? '…' : draftCount,   icon: Edit3, color: '#d97706', bg: '#fffbeb' },
            { label: 'Subjects',      value: loading ? '…' : subjectCount, icon: Sparkles, color: '#7c3aed', bg: '#fdf4ff' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={17} style={{ color }} />
              </div>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f0f23', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search lessons…"
              style={{ width: '100%', paddingLeft: '32px', padding: '8px 10px 8px 32px', border: '1px solid #e8eaed', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '2px' }}>
            {(['all', 'published', 'draft'] as const).map(s => (
              <button key={s} type="button" onClick={() => setFilterStatus(s)}
                style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: filterStatus === s ? '#fff' : 'transparent', color: filterStatus === s ? '#0f0f23' : '#6b7280', fontSize: '12px', cursor: 'pointer', fontWeight: filterStatus === s ? 600 : 400, boxShadow: filterStatus === s ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <CustomSelect
            options={['All Subjects', 'math', 'physics', 'chemistry', 'biology']}
            value={filterSubject}
            onChange={setFilterSubject}
            minWidth={150}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '14px' }}>
          {filtered.map(deck => {
            const st = ss(deck.subject as string);
            const menuOpen = openMenuId === deck.id;
            return (
              <div key={deck.id}
                style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>

                <div style={{ height: '5px', background: st.dot }} />

                <div style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '16px' }}>{st.emoji}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg, padding: '2px 7px', borderRadius: '5px' }}>
                        {(deck.subject as string).charAt(0).toUpperCase() + (deck.subject as string).slice(1)}
                      </span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>{deck.grade ?? ''}</span>
                    </div>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', fontWeight: 600, background: deck.status === 'published' ? '#d1fae5' : '#fef3c7', color: deck.status === 'published' ? '#065f46' : '#92400e' }}>
                      {deck.status === 'published' ? '✓ Published' : '✎ Draft'}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f0f23', margin: '0 0 8px', lineHeight: 1.3 }}>{deck.title}</h3>

                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#9ca3af', marginBottom: '14px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><FileText size={10} /> {deck.slide_count} slides</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Clock size={10} /> {formatDate(deck.updated_at)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {deck.deck_source === 'kb_ai' ? <Sparkles size={10} /> : <Upload size={10} />} {SOURCE_LABEL[deck.deck_source] ?? deck.deck_source}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" onClick={() => navigate(`/teacher/lesson-editor/${deck.id}`)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '7px', border: '1px solid #e8eaed', borderRadius: '7px', background: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
                      <Edit3 size={12} /> Edit
                    </button>
                    <button type="button" onClick={() => navigate(`/teacher/lesson-present/${deck.id}`)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '7px', border: 'none', borderRadius: '7px', background: '#3b5bdb', color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.9'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}>
                      <Eye size={12} /> Present
                    </button>
                    <div style={{ position: 'relative' }} data-lesson-menu-wrap={deck.id}>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenMenuId(menuOpen ? null : deck.id);
                        }}
                        disabled={busyId === deck.id}
                        style={{ width: '36px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e8eaed', borderRadius: '7px', background: '#fff', color: '#6b7280', cursor: 'pointer' }}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {menuOpen && (
                        <div
                          onClick={e => e.stopPropagation()}
                          style={{
                            position: 'absolute', right: 0, bottom: '100%', marginBottom: '6px', zIndex: 40,
                            minWidth: '160px', background: '#fff', border: '1px solid #e8eaed', borderRadius: '10px',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.12)', overflow: 'hidden',
                          }}
                        >
                          {deck.status === 'draft' ? (
                            <button
                              type="button"
                              onClick={() => publishDeck(deck.id)}
                              style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', background: '#fff', textAlign: 'left', fontSize: '13px', cursor: 'pointer' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                            >
                              Publish
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => rollbackDeck(deck.id)}
                              style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', background: '#fff', textAlign: 'left', fontSize: '13px', cursor: 'pointer' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                            >
                              Revert to draft
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setOpenMenuId(null); setDeleteId(deck.id); }}
                            style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', borderTop: '1px solid #f3f4f6', background: '#fff', textAlign: 'left', fontSize: '13px', color: '#b91c1c', cursor: 'pointer' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: '#9ca3af' }}>
              <BookOpen size={40} style={{ color: '#e5e7eb', marginBottom: '14px' }} />
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>No lessons found</div>
              <div style={{ fontSize: '12px' }}>Try adjusting your filters or create a new lesson.</div>
            </div>
          )}
        </div>
      </div>

      {deleteId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteId(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '14px', padding: '28px', maxWidth: '340px', width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f0f23', marginBottom: '6px' }}>Delete Lesson?</div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
              <strong>{decks.find(d => d.id === deleteId)?.title}</strong> will be permanently removed.
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button type="button" onClick={() => setDeleteId(null)} style={{ padding: '8px 20px', border: '1px solid #e8eaed', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={busyId === deleteId}
                style={{ padding: '8px 20px', border: 'none', borderRadius: '8px', background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </TeacherLayout>
  );
}
