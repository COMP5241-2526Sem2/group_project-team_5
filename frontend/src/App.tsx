import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner@2.0.3';
import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { LabsProvider } from './components/labs/LabsContext';
import { ChatProvider } from './components/labs/ChatContext';
import { queryClient } from './query/queryClient';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster richColors position="top-center" closeButton />
      <LabsProvider>
        <ChatProvider>
          <RouterProvider router={router} />
        </ChatProvider>
      </LabsProvider>
    </QueryClientProvider>
  );
}
