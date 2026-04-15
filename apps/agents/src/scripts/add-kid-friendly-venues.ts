import dotenv from 'dotenv';
import path from 'path';
import { prisma } from '@slo-events/database';
import { logger } from '../lib/scraper-utils';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Kid-friendly venues to add to the database
 */
const kidFriendlyVenues = [
  {
    name: 'SLO Children\'s Museum',
    normalizedName: 'slo childrens museum',
    address: '1010 Nipomo Street',
    city: 'San Luis Obispo',
    state: 'CA',
    zipCode: '93401',
    website: 'https://www.slocm.org',
    phone: '(805) 544-5437',
    venueType: 'museum',
    metadata: {
      ageRange: '2-10',
      description: 'Interactive museum with three floors of hands-on exhibits for children',
      features: ['indoor', 'educational', 'workshops', 'free-hours-monthly'],
    },
  },
  {
    name: 'SLO County Library - Main Branch',
    normalizedName: 'slo county library main branch',
    address: '995 Palm Street',
    city: 'San Luis Obispo',
    state: 'CA',
    zipCode: '93401',
    website: 'https://www.slolibrary.org',
    phone: '(805) 781-5991',
    venueType: 'library',
    metadata: {
      ageRange: 'all ages',
      description: 'Public library with kids programs, storytimes, and events',
      features: ['indoor', 'educational', 'free', 'storytime', 'crafts'],
    },
  },
  {
    name: 'SLO City Parks & Recreation',
    normalizedName: 'slo city parks recreation',
    address: '1000 Spring Street',
    city: 'San Luis Obispo',
    state: 'CA',
    zipCode: '93401',
    website: 'https://www.slocity.org/government/department-directory/parks-and-recreation',
    phone: '(805) 781-7300',
    venueType: 'recreation_center',
    metadata: {
      ageRange: 'all ages',
      description: 'City recreation programs including sports, classes, and camps',
      features: ['outdoor', 'sports', 'classes', 'camps', 'activities'],
    },
  },
  {
    name: 'SLO County Parks',
    normalizedName: 'slo county parks',
    website: 'https://slocountyparks.com',
    city: 'San Luis Obispo',
    state: 'CA',
    venueType: 'parks',
    metadata: {
      ageRange: 'all ages',
      description: 'County parks with recreation programs and special events',
      features: ['outdoor', 'nature', 'recreation', 'events'],
    },
  },
  {
    name: 'First 5 SLO County',
    normalizedName: 'first 5 slo county',
    address: '3555 Empleo Street',
    city: 'San Luis Obispo',
    state: 'CA',
    zipCode: '93401',
    website: 'https://www.first5slo.org',
    phone: '(805) 781-5050',
    venueType: 'community_organization',
    metadata: {
      ageRange: '0-5',
      description: 'Early childhood development programs and family events',
      features: ['educational', 'family-support', 'events'],
    },
  },
  {
    name: 'SanLuisObispoMom.com',
    normalizedName: 'sanluisobispomom',
    website: 'https://www.sanluisobispomom.com',
    city: 'San Luis Obispo',
    state: 'CA',
    venueType: 'event_aggregator',
    metadata: {
      ageRange: 'all ages',
      description: 'Family events aggregator and local parenting resource',
      features: ['event-listings', 'family-friendly', 'local-resources'],
    },
  },
  {
    name: 'SLO Botanical Garden',
    normalizedName: 'slo botanical garden',
    address: '3450 Dairy Creek Road',
    city: 'San Luis Obispo',
    state: 'CA',
    zipCode: '93405',
    website: 'https://www.slobg.org',
    phone: '(805) 541-1400',
    venueType: 'garden',
    metadata: {
      ageRange: 'all ages',
      description: 'Botanical garden with storytimes, nature walks, and seasonal displays',
      features: ['outdoor', 'educational', 'nature', 'walks', 'events'],
    },
  },
];

async function addKidFriendlyVenues() {
  try {
    logger.info('Adding kid-friendly venues to database...');

    for (const venue of kidFriendlyVenues) {
      try {
        // Check if venue already exists
        const existing = await prisma.venue.findFirst({
          where: {
            normalizedName: venue.normalizedName,
            city: venue.city,
          },
        });

        if (existing) {
          logger.info(`Venue already exists: ${venue.name}`);
          continue;
        }

        // Create venue
        const created = await prisma.venue.create({
          data: venue,
        });

        logger.info(`✓ Added venue: ${venue.name} (${created.id})`);
      } catch (error: any) {
        logger.error(`Failed to add venue ${venue.name}: ${error.message}`);
      }
    }

    logger.info('Finished adding kid-friendly venues');
  } catch (error: any) {
    logger.error(`Error adding venues: ${error.message}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
addKidFriendlyVenues()
  .then(() => {
    logger.info('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed:', error);
    process.exit(1);
  });
