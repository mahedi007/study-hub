import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CollectionPage, HomePage, LegacyCollectionPage, LegacyMaterialPage, LegacyTeacherPage, SharePage, TopicPage } from './public/PublicPages';
import { PageLoader } from './components/ui';

const AdminApp = lazy(() => import('./admin/AdminApp'));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/topic/:slug/*" element={<TopicPage />} />
      <Route path="/c/:id" element={<CollectionPage />} />
      <Route path="/t/:handle" element={<LegacyTeacherPage />} />
      <Route path="/t/:handle/m/:id" element={<LegacyMaterialPage />} />
      <Route path="/t/:handle/c/:id" element={<LegacyCollectionPage />} />
      <Route path="/s/:slug" element={<SharePage />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<PageLoader />}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}
