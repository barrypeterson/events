import { PrismaClient, EventCategory } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create sample venues
  const fremontTheater = await prisma.venue.upsert({
    where: { normalizedName_city: { normalizedName: 'fremont-theater', city: 'San Luis Obispo' } },
    update: {},
    create: {
      name: 'Fremont Theater',
      normalizedName: 'fremont-theater',
      address: '1035 Monterey St',
      city: 'San Luis Obispo',
      state: 'CA',
      zipCode: '93401',
      latitude: 35.2819,
      longitude: -120.6597,
      website: 'https://www.fremontslo.com',
      phone: '(805) 329-5725',
      venueType: 'theater',
    },
  });

  const slobrew = await prisma.venue.upsert({
    where: { normalizedName_city: { normalizedName: 'slo-brew-rock', city: 'San Luis Obispo' } },
    update: {},
    create: {
      name: 'SLO Brew Rock',
      normalizedName: 'slo-brew-rock',
      address: '855 Aerovista Pl',
      city: 'San Luis Obispo',
      state: 'CA',
      zipCode: '93401',
      latitude: 35.2376,
      longitude: -120.6413,
      website: 'https://slobrew.com',
      venueType: 'venue',
    },
  });

  const pacSlo = await prisma.venue.upsert({
    where: { normalizedName_city: { normalizedName: 'pac-slo', city: 'San Luis Obispo' } },
    update: {},
    create: {
      name: 'Performing Arts Center San Luis Obispo',
      normalizedName: 'pac-slo',
      address: '1 Grand Ave',
      city: 'San Luis Obispo',
      state: 'CA',
      zipCode: '93407',
      latitude: 35.3050,
      longitude: -120.6625,
      website: 'https://www.pacslo.org',
      phone: '(805) 756-4849',
      venueType: 'theater',
    },
  });

  console.log('✅ Created venues:', {
    fremontTheater: fremontTheater.id,
    slobrew: slobrew.id,
    pacSlo: pacSlo.id,
  });

  // Create sample events
  const event1 = await prisma.event.create({
    data: {
      title: 'Live Jazz Night',
      normalizedTitle: 'live-jazz-night',
      description: 'An evening of smooth jazz featuring local musicians',
      startDateTime: new Date('2024-12-15T19:00:00-08:00'),
      endDateTime: new Date('2024-12-15T22:00:00-08:00'),
      venueId: fremontTheater.id,
      category: [EventCategory.MUSIC],
      tags: ['jazz', 'live music', 'local artists'],
      images: [],
      priceMin: 15,
      priceMax: 25,
      isFree: false,
      ageRestriction: '21+',
      embedding: Array(1536).fill(0), // Placeholder embedding
      sources: {
        create: {
          sourceUrl: 'https://www.fremontslo.com/shows',
          sourceName: 'Fremont Theater Website',
          rawData: {},
        },
      },
    },
  });

  const event2 = await prisma.event.create({
    data: {
      title: 'Comedy Open Mic',
      normalizedTitle: 'comedy-open-mic',
      description: 'Stand-up comedy open mic night - all skill levels welcome!',
      startDateTime: new Date('2024-12-18T20:00:00-08:00'),
      venueId: slobrew.id,
      category: [EventCategory.COMEDY],
      tags: ['comedy', 'open mic', 'standup'],
      images: [],
      isFree: true,
      ageRestriction: '18+',
      embedding: Array(1536).fill(0),
      isRecurring: true,
      recurringPattern: {
        frequency: 'weekly',
        dayOfWeek: 3, // Wednesday
        time: '20:00',
      },
      recurringSeriesId: 'slobrew-comedy-open-mic',
      sources: {
        create: {
          sourceUrl: 'https://slobrew.com/events',
          sourceName: 'SLO Brew Website',
          rawData: {},
        },
      },
    },
  });

  const event3 = await prisma.event.create({
    data: {
      title: 'Holiday Symphony Concert',
      normalizedTitle: 'holiday-symphony-concert',
      description: 'Cal Poly Symphony Orchestra performs holiday classics',
      startDateTime: new Date('2024-12-20T19:30:00-08:00'),
      venueId: pacSlo.id,
      category: [EventCategory.MUSIC, EventCategory.FAMILY],
      tags: ['classical', 'symphony', 'holiday', 'family-friendly'],
      images: [],
      priceMin: 20,
      priceMax: 50,
      isFree: false,
      ageRestriction: 'All Ages',
      embedding: Array(1536).fill(0),
      sources: {
        create: {
          sourceUrl: 'https://www.pacslo.org/events',
          sourceName: 'PAC SLO Website',
          rawData: {},
        },
      },
    },
  });

  console.log('✅ Created events:', {
    event1: event1.id,
    event2: event2.id,
    event3: event3.id,
  });

  // Create a sample user
  const user = await prisma.user.create({
    data: {
      email: 'demo@sloevents.local',
      firstName: 'Demo',
      lastName: 'User',
      preferences: {
        emailNotifications: true,
        categories: [EventCategory.MUSIC, EventCategory.COMEDY],
      },
    },
  });

  console.log('✅ Created user:', user.email);

  // Create sample interaction
  await prisma.userEventInteraction.create({
    data: {
      userId: user.id,
      eventId: event1.id,
      interactionType: 'INTERESTED',
    },
  });

  console.log('✅ Created sample user interaction');

  console.log('🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
