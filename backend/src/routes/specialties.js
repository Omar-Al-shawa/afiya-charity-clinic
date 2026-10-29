import { Router } from 'express';
import { listSpecialties } from '../repositories/catalogRepository.js';

export function createSpecialtiesRouter(db) {
  const router = Router();

  router.get('/', async (req, res) => {
    const rows = await listSpecialties(db);
    res.json(
      rows.map((row) => ({
        id: row.specialty_id,
        name: row.specialty_name,
        appointmentDuration: row.appointment_duration,
        doctorsCount: row.doctors_count,
      })),
    );
  });

  return router;
}
