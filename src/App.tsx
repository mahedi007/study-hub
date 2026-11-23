import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CollectionPage, HomePage, MaterialPage, SharePage, TeacherPage } from './public/PublicPages';
import { PageLoader } from './components/ui';

const AdminApp = lazy(() => import('./admin/AdminApp'));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/t/:handle" element={<TeacherPage />} />
      <Route path="/t/:handle/m/:id" element={<MaterialPage />} />
      <Route path="/t/:handle/c/:id" element={<CollectionPage />} />
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
