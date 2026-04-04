import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { LabsProvider } from './components/labs/LabsContext';
import { ChatProvider } from './components/labs/ChatContext';

export default function App() {
  return (
    <LabsProvider>
      <ChatProvider>
        <RouterProvider router={router} />
      </ChatProvider>
    </LabsProvider>
  );
}
