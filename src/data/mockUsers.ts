import { User } from '../types';

export const mockUsers: User[] = [
  { id: 'u01', username: 'user1', password: '123456', displayName: '小明', role: 'user', avatar: 'https://picsum.photos/seed/user1/200' },
  { id: 'u02', username: 'guide1', password: '123456', displayName: '陈导', role: 'guide', avatar: 'https://picsum.photos/seed/guide1/200', guideId: 'g01' },
  { id: 'u03', username: 'guide2', password: '123456', displayName: '林姐', role: 'guide', avatar: 'https://picsum.photos/seed/guide2/200', guideId: 'g02' },
  { id: 'u04', username: 'admin1', password: '123456', displayName: '管理员', role: 'admin', avatar: 'https://picsum.photos/seed/admin1/200' },
  { id: 'u05', username: 'hhh', password: '123456', displayName: '欢欢', role: 'user', avatar: 'https://picsum.photos/seed/hhh/200' },
  { id: 'u06', username: 'syj', password: '123456', displayName: '思远', role: 'user', avatar: 'https://picsum.photos/seed/syj/200' },
  { id: 'u07', username: 'test1', password: '123456', displayName: '旅行者A', role: 'user', avatar: 'https://picsum.photos/seed/test1/200' },
  { id: 'u08', username: 'test2', password: '123456', displayName: '旅行者B', role: 'user', avatar: 'https://picsum.photos/seed/test2/200' },
];
