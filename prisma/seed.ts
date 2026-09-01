import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Development seed — creates minimum data to test the Auth API.
 *
 * Creates 2 institutes with 1 admin user each, plus branches and
 * academic years. Two institutes are needed to verify tenant isolation.
 *
 * ┌──────────────────────────────────────────────────┐
 * │ Test Credentials                                 │
 * ├──────────────────────────────────────────────────┤
 * │ Institute 1 (Al-Noor Academy)                    │
 * │   Phone:    +966511111111                        │
 * │   Password: Password123!                         │
 * │                                                  │
 * │ Institute 2 (Sunrise School)                     │
 * │   Phone:    +966522222222                        │
 * │   Password: Password123!                         │
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

  const admin1 = await prisma.user.create({
    data: {
      instituteId: institute1.id,
      fullName: 'Admin Al-Noor',
      phone: '+966511111111',
      passwordHash,
      role: 'INSTITUTE_ADMIN',
    },
  });
  console.log(`   └─ Admin: ${admin1.fullName} (phone: ${admin1.phone})`);

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
  console.log(`   └─ Admin: ${admin2.fullName} (phone: ${admin2.phone})`);

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
  console.log('  Institute 1: +966511111111 / Password123!');
  console.log('  Institute 2: +966522222222 / Password123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
