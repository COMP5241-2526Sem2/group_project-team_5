import { useLocation } from 'react-router';
import TeacherLayout from '../../components/teacher/TeacherLayout';
import AssessmentGenerate from './assessment/AssessmentGenerate';
import AssessmentAIPaper  from './assessment/AssessmentAIPaper';
import AssessmentLibrary  from './assessment/AssessmentLibrary';
import AssessmentPapers   from './assessment/AssessmentPapers';
import AssessmentGrading  from './assessment/AssessmentGrading';

export default function Assessment() {
  const { pathname } = useLocation();

  function renderContent() {
    if (pathname.startsWith('/teacher/assessment/ai-paper'))  return <AssessmentAIPaper />;
    if (pathname.startsWith('/teacher/assessment/library'))   return <AssessmentLibrary />;
    if (pathname.startsWith('/teacher/assessment/papers'))    return <AssessmentPapers />;
    if (pathname.startsWith('/teacher/assessment/grading'))   return <AssessmentGrading />;
    return <AssessmentGenerate />;
  }

  return (
    <TeacherLayout>
      {renderContent()}
    </TeacherLayout>
  );
}