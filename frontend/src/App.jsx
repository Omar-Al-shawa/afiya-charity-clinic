import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import PublicLayout from './layouts/PublicLayout';
import HomePage from './pages/public/HomePage';
import AboutPage from './pages/public/AboutPage';
import DonationsPage from './pages/public/DonationsPage';
import SpecialtiesPage from './pages/public/SpecialtiesPage';
import DoctorsPage from './pages/public/DoctorsPage';
import DoctorDetailsPage from './pages/public/DoctorDetailsPage';
import AppointmentBookingPage from './pages/public/AppointmentBookingPage';
import LoginPage from './pages/public/LoginPage';
import RegisterPage from './pages/public/RegisterPage';
import ContactPage from './pages/public/ContactPage';
import AuthLayout from './components/auth/AuthLayout';
import GuestOnly from './components/auth/GuestOnly';
import RequireRole from './components/auth/RequireRole';
import AdminLayout from './components/admin/AdminLayout';
import AdminAppointmentsPage from './pages/admin/AdminAppointmentsPage';
import AdminDoctorsPage from './pages/admin/AdminDoctorsPage';
import AdminHomePage from './pages/admin/AdminHomePage';
import AdminPasswordPage from './pages/admin/AdminPasswordPage';
import AdminPatientsPage from './pages/admin/AdminPatientsPage';
import AdminPendingChangesPage from './pages/admin/AdminPendingChangesPage';
import AdminSpecialtiesPage from './pages/admin/AdminSpecialtiesPage';
import DoctorAppointmentsPage from './pages/doctor/DoctorAppointmentsPage';
import DoctorPasswordPage from './pages/doctor/DoctorPasswordPage';
import DoctorSchedulePage from './pages/doctor/DoctorSchedulePage';
import MyAppointmentsPage from './pages/patient/MyAppointmentsPage';
import PatientProfilePage from './pages/patient/PatientProfilePage';
import PlaceholderPage from './pages/PlaceholderPage';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<HomePage />} />
              {/* ما لم تُنفَّذ شاشته بعد يستخدم PlaceholderPage */}
              <Route path="specialties" element={<SpecialtiesPage />} />
              <Route path="doctors" element={<DoctorsPage />} />
              <Route path="doctors/:id" element={<DoctorDetailsPage />} />
              <Route path="doctors/:id/book" element={<AppointmentBookingPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="donations" element={<DonationsPage />} />
              <Route path="contact" element={<ContactPage />} />
              <Route element={<GuestOnly />}>
                <Route element={<AuthLayout />}>
                  <Route path="login" element={<LoginPage />} />
                  <Route path="register" element={<RegisterPage />} />
                </Route>
              </Route>
              {/* منطقة المريض: الصفحة الرئيسية للمريض تبقى «/»، و«/patient» يُحوَّل إلى مواعيده */}
              <Route element={<RequireRole roles={['patient']} />}>
                <Route path="patient" element={<Navigate to="/patient/appointments" replace />} />
                <Route path="patient/appointments" element={<MyAppointmentsPage />} />
                <Route path="patient/profile" element={<PatientProfilePage />} />
              </Route>
              {/* بوابة الطبيب (جدولي + المواعيد)، ثم لوحة الإدارة بأقسامها الستة */}
              <Route element={<RequireRole roles={['doctor']} />}>
                <Route path="doctor" element={<DoctorSchedulePage />} />
                <Route path="doctor/appointments" element={<DoctorAppointmentsPage />} />
                <Route path="doctor/password" element={<DoctorPasswordPage />} />
              </Route>
              <Route element={<RequireRole roles={['admin']} />}>
                <Route path="admin" element={<AdminLayout />}>
                  <Route index element={<AdminHomePage />} />
                  <Route path="specialties" element={<AdminSpecialtiesPage />} />
                  <Route path="doctors" element={<AdminDoctorsPage />} />
                  <Route path="patients" element={<AdminPatientsPage />} />
                  <Route path="appointments" element={<AdminAppointmentsPage />} />
                  <Route path="pending-changes" element={<AdminPendingChangesPage />} />
                  <Route path="password" element={<AdminPasswordPage />} />
                </Route>
              </Route>
              <Route path="*" element={<PlaceholderPage title="الصفحة غير موجودة" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
