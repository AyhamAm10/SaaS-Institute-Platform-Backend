import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env['DATABASE_URL']!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/**
 * Development seed — creates super admin, sample institutes, and institute admins.
 *
 * ┌──────────────────────────────────────────────────┐
 * │ Test Credentials                                 │
 * ├──────────────────────────────────────────────────┤
 * │ Super Admin (System Manager)                     │
 * │   Phone:    +966500000000                        │
 * │   Password: Password123!                         │
 * │   Role:     SUPER_ADMIN                          │
 * │                                                  │
 * │ Institute 1 (Al-Noor Academy)                    │
 * │   Phone:    +966511111111                        │
 * │   Password: Password123!                         │
 * │   Role:     INSTITUTE_ADMIN                      │
 * │                                                  │
 * │ Institute 2 (Sunrise School)                     │
 * │   Phone:    +966522222222                        │
 * │   Password: Password123!                         │
 * │   Role:     INSTITUTE_ADMIN                      │
 * └──────────────────────────────────────────────────┘
 */
async function main() {
  console.log('🌱 Seeding database...\n');

  const passwordHash = await bcrypt.hash('Password123!', 12);

  // ── Institute 1 ────────────────────────────────────────────────────────
  const institute1 = await prisma.institute.create({
    data: {
      name: 'Al-Noor Academy',
      logoUrl: 'https://example.com/alnoor-logo.png',
      primaryColor: '#1a73e8',
      secondaryColor: '#34a853',
      phone: '+966500000001',
      address: 'Riyadh, Saudi Arabia',
    },
  });
  console.log(`✅ Institute: ${institute1.name} (id: ${institute1.id})`);

  // Super Admin account (assigned to root institute for foreign key)
  const superAdmin = await prisma.user.create({
    data: {
      instituteId: institute1.id,
      fullName: 'Super Administrator',
      phone: '+966500000000',
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`   └─ Super Admin: ${superAdmin.fullName} (phone: ${superAdmin.phone})`);

  const admin1 = await prisma.user.create({
    data: {
      instituteId: institute1.id,
      fullName: 'Admin Al-Noor',
      phone: '+966511111111',
      passwordHash,
      role: 'INSTITUTE_ADMIN',
    },
  });
  console.log(`   └─ Institute Admin 1: ${admin1.fullName} (phone: ${admin1.phone})`);

  await prisma.instituteAdmin.create({
    data: { instituteId: institute1.id, userId: admin1.id },
  });

  await prisma.branch.create({
    data: {
      instituteId: institute1.id,
      name: 'Main Branch',
      code: 'MAIN',
      phone: '+966511111112',
      address: 'Riyadh Main Campus',
      isActive: true,
    },
  });

  await prisma.academicYear.create({
    data: {
      instituteId: institute1.id,
      name: '2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
      isCurrent: true,
    },
  });

  // ── Institute 2 ────────────────────────────────────────────────────────
  const institute2 = await prisma.institute.create({
    data: {
      name: 'Sunrise School',
      logoUrl: 'https://example.com/sunrise-logo.png',
      primaryColor: '#ff6d00',
      secondaryColor: '#ffd600',
      phone: '+966500000002',
      address: 'Jeddah, Saudi Arabia',
    },
  });
  console.log(`\n✅ Institute: ${institute2.name} (id: ${institute2.id})`);

  const admin2 = await prisma.user.create({
    data: {
      instituteId: institute2.id,
      fullName: 'Admin Sunrise',
      phone: '+966522222222',
      passwordHash,
      role: 'INSTITUTE_ADMIN',
    },
  });
  console.log(`   └─ Institute Admin 2: ${admin2.fullName} (phone: ${admin2.phone})`);

  await prisma.instituteAdmin.create({
    data: { instituteId: institute2.id, userId: admin2.id },
  });

  await prisma.branch.create({
    data: {
      instituteId: institute2.id,
      name: 'Main Branch',
      code: 'MAIN',
      phone: '+966522222223',
      address: 'Jeddah Main Campus',
      isActive: true,
    },
  });

  await prisma.academicYear.create({
    data: {
      instituteId: institute2.id,
      name: '2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
      isCurrent: true,
    },
  });

  console.log('\n────────────────────────────────────────');
  console.log('🎉 Seed completed successfully!');
  console.log('────────────────────────────────────────');
  console.log('\n📋 Test Credentials:');
  console.log('  Super Admin:      +966500000000 / Password123!');
  console.log('  Institute Admin 1: +966511111111 / Password123!');
  console.log('  Institute Admin 2: +966522222222 / Password123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
