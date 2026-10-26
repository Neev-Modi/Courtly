import { Route, Routes, Link } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { LoadingScreen } from '../shared/components/LoadingScreen';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { AccountPage } from '../features/account/AccountPage';
import { AppShell } from '../shared/components/AppShell';
const CourtsPage = lazy(() =>
  import('../features/courts/CourtsPage').then((module) => ({ default: module.CourtsPage })),
);
const ManageCourtsPage = lazy(() =>
  import('../features/courts/ManageCourtsPage').then((module) => ({
    default: module.ManageCourtsPage,
  })),
);
const BookingsPage = lazy(() =>
  import('../features/bookings/BookingsPage').then((module) => ({ default: module.BookingsPage })),
);
const AnalysisPage = lazy(() =>
  import('../features/analysis/AnalysisPage').then((module) => ({ default: module.AnalysisPage })),
);
export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/account" element={<AccountPage />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<CourtsPage />} />
            <Route path="/bookings" element={<BookingsPage />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute role="admin" />}>
          <Route element={<AppShell />}>
            <Route path="/admin" element={<ManageCourtsPage />} />
            <Route path="/admin/bookings" element={<BookingsPage admin />} />
            <Route path="/admin/analysis" element={<AnalysisPage />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <main className="loading-screen">
              <h1>Off the court?</h1>
              <p>We couldn’t find that page.</p>
              <Link className="primary-button" to="/">
                Back to Courtly
              </Link>
            </main>
          }
        />
      </Routes>
    </Suspense>
  );
}
