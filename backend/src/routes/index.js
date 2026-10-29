import { Router } from 'express';
import { createDueChangesGuard } from '../middleware/dueChanges.js';
import { createAdminCatalogRouter } from './adminCatalog.js';
import { createAdminViewsRouter } from './adminViews.js';
import { createAppointmentsRouter } from './appointments.js';
import { createAuthRouter } from './auth.js';
import { createContactRouter } from './contact.js';
import { createDoctorRouter } from './doctorPortal.js';
import { createDoctorsRouter } from './doctors.js';
import { createHealthRouter } from './health.js';
import { createPatientRouter } from './patientProfile.js';
import { createSpecialtiesRouter } from './specialties.js';

// جذر مسارات /api؛ مسارات المراحل اللاحقة تُركَّب هنا
// dueChanges ينفّذ التغييرات المعلّقة المستحقة قبل المسارات المعتمدة على حالة الأطباء والاختصاصات، وقبل authenticate ليرى is_active المحدَّث.
// المسارات المستقلة عنها (health وcontact وpatient والتسجيل والخروج وتغيير كلمة المرور) لا تمرّ به.
export function createApiRouter({ db, config, clock, mailer, processDueChanges }) {
  const router = Router();
  const dueChanges = createDueChangesGuard(processDueChanges);
  router.use('/health', createHealthRouter(db));
  router.use('/auth', createAuthRouter({ db, config, dueChanges }));
  router.use('/contact', createContactRouter({ config, mailer }));
  router.use('/specialties', dueChanges, createSpecialtiesRouter(db));
  router.use('/doctors', dueChanges, createDoctorsRouter(db, clock));
  router.use('/appointments', dueChanges, createAppointmentsRouter({ db, config }));
  router.use('/patient', createPatientRouter({ db, config }));
  router.use('/doctor', dueChanges, createDoctorRouter({ db, config, clock }));
  router.use('/admin', dueChanges);
  router.use('/admin', createAdminCatalogRouter({ db, config }));
  router.use('/admin', createAdminViewsRouter({ db, config }));
  return router;
}
