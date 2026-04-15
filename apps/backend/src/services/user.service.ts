import { prisma } from '../config/database';
import { logger } from '../lib/logger';
import { UserUpdateInput } from '../types';
import { NotFoundError, ConflictError } from '../middleware/error';
import { hashPassword } from './auth.service';

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        spotifyUserId: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Get user error:', error);
    throw new Error('Failed to get user');
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        spotifyUserId: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Get user by email error:', error);
    throw new Error('Failed to get user');
  }
}

/**
 * Update user profile
 */
export async function updateUser(userId: string, input: UserUpdateInput) {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        preferences: input.preferences as any,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        spotifyUserId: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    logger.info('User updated successfully', { userId });

    return user;
  } catch (error) {
    logger.error('Update user error:', error);
    throw new Error('Failed to update user');
  }
}

/**
 * Delete user account
 */
export async function deleteUser(userId: string): Promise<void> {
  try {
    await prisma.user.delete({
      where: { id: userId },
    });

    logger.info('User deleted successfully', { userId });
  } catch (error) {
    logger.error('Delete user error:', error);
    throw new Error('Failed to delete user');
  }
}

/**
 * Update user password
 */
export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const bcrypt = require('bcrypt');
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isValid) {
      throw new ConflictError('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    logger.info('Password updated successfully', { userId });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ConflictError) {
      throw error;
    }
    logger.error('Update password error:', error);
    throw new Error('Failed to update password');
  }
}

/**
 * Get user event interactions
 */
export async function getUserInteractions(userId: string) {
  try {
    const interactions = await prisma.userEventInteraction.findMany({
      where: { userId },
      include: {
        event: {
          include: {
            venue: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return interactions;
  } catch (error) {
    logger.error('Get user interactions error:', error);
    throw new Error('Failed to get user interactions');
  }
}

/**
 * Add event interaction
 */
export async function addEventInteraction(
  userId: string,
  eventId: string,
  interactionType: 'INTERESTED' | 'GOING' | 'NOT_INTERESTED' | 'SAVED' | 'SHARED'
) {
  try {
    const interaction = await prisma.userEventInteraction.upsert({
      where: {
        userId_eventId_interactionType: {
          userId,
          eventId,
          interactionType,
        },
      },
      create: {
        userId,
        eventId,
        interactionType,
      },
      update: {},
    });

    logger.info('Event interaction added', { userId, eventId, interactionType });

    return interaction;
  } catch (error) {
    logger.error('Add event interaction error:', error);
    throw new Error('Failed to add event interaction');
  }
}

/**
 * Remove event interaction
 */
export async function removeEventInteraction(
  userId: string,
  eventId: string,
  interactionType: 'INTERESTED' | 'GOING' | 'NOT_INTERESTED' | 'SAVED' | 'SHARED'
): Promise<void> {
  try {
    await prisma.userEventInteraction.delete({
      where: {
        userId_eventId_interactionType: {
          userId,
          eventId,
          interactionType,
        },
      },
    });

    logger.info('Event interaction removed', { userId, eventId, interactionType });
  } catch (error) {
    logger.error('Remove event interaction error:', error);
    throw new Error('Failed to remove event interaction');
  }
}
