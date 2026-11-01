import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding XPOS database...');

  // ── Create Pricing Rules ──
  await prisma.pricingRule.upsert({
    where: { paperSize_colorMode: { paperSize: 'A4', colorMode: 'BW' } },
    update: {},
    create: {
      paperSize: 'A4',
      colorMode: 'BW',
      pricePerPage: 2,
      isActive: true,
    },
  });

  await prisma.pricingRule.upsert({
    where: { paperSize_colorMode: { paperSize: 'A4', colorMode: 'COLOR' } },
    update: {},
    create: {
      paperSize: 'A4',
      colorMode: 'COLOR',
      pricePerPage: 10,
      isActive: true,
    },
  });

  console.log('✅ Pricing rules created');

  // ── Create Default Shop ──
  const defaultShop = await prisma.shop.upsert({
    where: { code: 'SHOP-MAIN' },
    update: {},
    create: {
      name: 'Main Campus Print Hub',
      code: 'SHOP-MAIN',
      address: 'Central Library Building, Ground Floor',
      phone: '+91 98765 43210',
      status: 'ACTIVE',
    },
  });

  console.log('✅ Default shop created:', defaultShop.name);

  // ── Create Demo Kiosks ──
  const kiosk1 = await prisma.kiosk.upsert({
    where: { displayId: 'XPOS-001' },
    update: { shopId: defaultShop.id },
    create: {
      displayId: 'XPOS-001',
      name: 'College Library Kiosk',
      location: 'College Library, Ground Floor',
      status: 'ACTIVE',
      qrUrl: 'http://localhost:3000/print?kiosk=XPOS-001',
      shopId: defaultShop.id,
    },
  });

  // Set default kiosk for shop
  await prisma.shop.update({
    where: { id: defaultShop.id },
    data: { defaultKioskId: kiosk1.id },
  });

  const kiosk2 = await prisma.kiosk.upsert({
    where: { displayId: 'XPOS-002' },
    update: { shopId: defaultShop.id },
    create: {
      displayId: 'XPOS-002',
      name: 'Hostel Block A Kiosk',
      location: 'Hostel Block A, Reception',
      status: 'ACTIVE',
      qrUrl: 'http://localhost:3000/print?kiosk=XPOS-002',
      shopId: defaultShop.id,
    },
  });

  const kiosk3 = await prisma.kiosk.upsert({
    where: { displayId: 'XPOS-003' },
    update: { shopId: defaultShop.id },
    create: {
      displayId: 'XPOS-003',
      name: 'Main Gate Kiosk',
      location: 'Main Gate, Security Office',
      status: 'MAINTENANCE',
      qrUrl: 'http://localhost:3000/print?kiosk=XPOS-003',
      shopId: defaultShop.id,
    },
  });

  console.log('✅ Demo kiosks created and linked to shop');

  // ── Create Printers for Kiosks ──
  await prisma.printer.upsert({
    where: { kioskId: kiosk1.id },
    update: {},
    create: {
      name: 'HP LaserJet Pro M404',
      model: 'HP LaserJet Pro M404',
      status: 'READY',
      kioskId: kiosk1.id,
    },
  });

  await prisma.printer.upsert({
    where: { kioskId: kiosk2.id },
    update: {},
    create: {
      name: 'Canon imageCLASS LBP226',
      model: 'Canon imageCLASS LBP226',
      status: 'READY',
      kioskId: kiosk2.id,
    },
  });

  await prisma.printer.upsert({
    where: { kioskId: kiosk3.id },
    update: {},
    create: {
      name: 'Brother HL-L2350DW',
      model: 'Brother HL-L2350DW',
      status: 'OFFLINE',
      kioskId: kiosk3.id,
    },
  });

  console.log('✅ Printers created');

  // ── Create Super Admin User ──
  const superAdminPasswordHash = crypto
    .createHash('sha256')
    .update('admin123')
    .digest('hex');

  await prisma.adminUser.upsert({
    where: { email: 'admin@xpos.app' },
    update: { role: 'SUPER_ADMIN' },
    create: {
      email: 'admin@xpos.app',
      passwordHash: superAdminPasswordHash,
      name: 'XPOS Super Admin',
      role: 'SUPER_ADMIN',
    },
  });

  console.log('✅ Super Admin user created (admin@xpos.app / admin123)');

  // ── Create Shop Admin User ──
  const shopAdminPasswordHash = crypto
    .createHash('sha256')
    .update('shop123')
    .digest('hex');

  await prisma.adminUser.upsert({
    where: { email: 'shopadmin@xpos.app' },
    update: { role: 'SHOP_ADMIN', shopId: defaultShop.id },
    create: {
      email: 'shopadmin@xpos.app',
      passwordHash: shopAdminPasswordHash,
      name: 'Main Campus Shop Admin',
      role: 'SHOP_ADMIN',
      shopId: defaultShop.id,
    },
  });

  console.log('✅ Shop Admin user created (shopadmin@xpos.app / shop123)');

  // ── Create Default Settings ──
  const settings = [
    { key: 'print_code_expiry_minutes', value: '30', description: 'Print code expiry time in minutes' },
    { key: 'max_file_size_mb', value: '50', description: 'Maximum file upload size in MB' },
    { key: 'file_retention_minutes', value: '30', description: 'Time to keep files after printing' },
    { key: 'max_copies', value: '20', description: 'Maximum number of copies per job' },
    { key: 'kiosk_idle_timeout_ms', value: '60000', description: 'Kiosk idle timeout in milliseconds' },
    { key: 'kiosk_heartbeat_interval_ms', value: '30000', description: 'Kiosk heartbeat interval in milliseconds' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log('✅ Default settings created');

  console.log('\n🎉 XPOS database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
