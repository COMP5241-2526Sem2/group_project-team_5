import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import TeacherLayout from '../../components/teacher/TeacherLayout';
import AssessmentGenerate from './assessment/AssessmentGenerate';
import AssessmentAIPaper  from './assessment/AssessmentAIPaper';
import AssessmentLibrary  from './assessment/AssessmentLibrary';
import AssessmentPapers   from './assessment/AssessmentPapers';
import AssessmentGrading  from './assessment/AssessmentGrading';
import AssessmentPaperEdit from './assessment/AssessmentPaperEdit';
import AssessmentPaperImport from './assessment/AssessmentPaperImport';

/** 试卷编辑页路径，需与列表页 /papers 区分 */
const isPaperEditPath = (p: string) =>
  /^\/teacher\/assessment\/papers\/\d+\/edit$/.test(p);

export default function Assessment() {
  const { pathname } = useLocation();

  const isPaperEdit = isPaperEditPath(pathname);
  const isPaperImport = pathname.startsWith('/teacher/assessment/papers/import');
  const isLibrary = pathname.startsWith('/teacher/assessment/library');
  const isPapersList = pathname.startsWith('/teacher/assessment/papers') && !isPaperEdit && !isPaperImport;

  /** 曾在当前会话中打开过题库 / 试卷列表则保持挂载，切换侧栏时不必重新请求、可立即展示缓存 UI */
  const [libraryKept, setLibraryKept] = useState(false);
  const [papersListKept, setPapersListKept] = useState(false);
  useEffect(() => {
    if (isLibrary) setLibraryKept(true);
  }, [isLibrary]);
  useEffect(() => {
    if (isPapersList) setPapersListKept(true);
  }, [isPapersList]);

  const mountLibrary = isLibrary || libraryKept;
  const mountPapersList = isPapersList || papersListKept;

  function renderContent() {
    if (isPaperEdit) {
      return <AssessmentPaperEdit />;
    }
    if (isPaperImport) {
      return <AssessmentPaperImport />;
    }
    if (pathname.startsWith('/teacher/assessment/ai-paper'))  return <AssessmentAIPaper />;
    if (isLibrary || isPapersList) {
      return (
        <>
          {mountLibrary && (
            <div
              style={{ display: isLibrary ? 'block' : 'none' }}
              aria-hidden={!isLibrary}
            >
              <AssessmentLibrary />
            </div>
          )}
          {mountPapersList && (
            <div
              style={{ display: isPapersList ? 'block' : 'none' }}
              aria-hidden={!isPapersList}
            >
              <AssessmentPapers />
            </div>
          )}
        </>
      );
    }
    if (pathname.startsWith('/teacher/assessment/grading'))   return <AssessmentGrading />;
    return <AssessmentGenerate />;
  }

  return (
    <TeacherLayout>
      {renderContent()}
    </TeacherLayout>
  );
}