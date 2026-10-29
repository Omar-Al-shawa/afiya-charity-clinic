import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.rtl.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.css';
import './styles/home.css';
import './styles/about.css';
import './styles/donations.css';
import './styles/specialties.css';
import './styles/doctors.css';
import './styles/doctor-details.css';
import './styles/appointment-booking.css';
import './styles/auth.css';
import './styles/contact.css';
import './styles/patient.css';
import './styles/doctor-portal.css';
import './styles/admin.css';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
