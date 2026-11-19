import { db } from '../../database/db';
import { NotFoundError } from '../../utils/errors';
import { usersRepository } from './users.repository';
import { toUserDto, type UserDto } from './users.types';

export const usersService = {
  async getById(id: string): Promise<UserDto> {
    const user = await usersRepository.findById(db, id);
    if (!user) throw new NotFoundError('User not found');
    return toUserDto(user);
  },
};
