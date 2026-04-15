import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { generateTokenPair, verifyRefreshToken } from '../lib/jwt';
import { logger } from '../lib/logger';
import {
  AuthResponse,
  LoginCredentials,
  UserCreateInput,
} from '../types';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} from '../middleware/error';

const SALT_ROUNDS = 10;

/**
 * Register a new user
 */
export async function register(
  input: UserCreateInput
): Promise<AuthResponse> {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        lastLoginAt: new Date(),
      },
    });

    // Generate tokens
    const tokens = generateTokenPair(user.id, user.email);

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = user;

    logger.info('User registered successfully', { userId: user.id });

    return {
      user: userWithoutPassword,
      tokens,
    };
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof BadRequestError
    ) {
      throw error;
    }
    logger.error('Registration error:', error);
    throw new Error('Failed to register user');
  }
}

/**
 * Login user with email and password
 */
export async function login(
  credentials: LoginCredentials
): Promise<AuthResponse> {
  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: credentials.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      credentials.password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const tokens = generateTokenPair(user.id, user.email);

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = user;

    logger.info('User logged in successfully', { userId: user.id });

    return {
      user: userWithoutPassword,
      tokens,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    logger.error('Login error:', error);
    throw new Error('Failed to login');
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string }> {
  try {
    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Generate new access token
    const tokens = generateTokenPair(user.id, user.email);

    logger.info('Access token refreshed', { userId: user.id });

    return {
      accessToken: tokens.accessToken,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    logger.error('Token refresh error:', error);
    throw new Error('Failed to refresh token');
  }
}

/**
 * Verify password strength
 */
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Hash password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare password with hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
