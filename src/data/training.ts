export const TRAINING_COURSE = {
  title: 'Advanced 4x4 Driving & Recovery Course',
  price: 4250,
  vatIncluded: true,
  minDrivers: 8,
  duration: '08:00 – 16:30',
  venues: [
    'Zwartkops Raceway, Pretoria West',
    'De Wildt, North West',
    'Onsite training available on request',
  ],
  includes: [
    'Tea, coffee and muffins on arrival',
    'Full cooked lunch',
    'Beverages throughout the day',
    'Certificate of completion',
    'Vehicle available on request at no extra cost',
  ],
  curriculum: [
    'Vehicle dynamics and transmission operation',
    'Reading and assessing terrain',
    'Steep ascents and descents',
    'Sand, mud and water crossing techniques',
    'Vehicle recovery — self-recovery and assisted',
    'Winching theory and practice',
    'Safe towing procedures',
  ],
  contact: 'info@landcruisersa.co.za',
};

// Add upcoming session dates here as they're confirmed
export const TRAINING_SESSIONS: {
  id: string;
  date: string;
  venue: string;
  spotsAvailable: number;
}[] = [
  // Example:
  // { id: 'session-2026-08-15', date: '2026-08-15', venue: 'Zwartkops Raceway, Pretoria West', spotsAvailable: 12 },
];
