import { UserRole } from './user-role.enum';

/**
 * Permissions (role.md §8.6). The single source of truth of "who can do
 * what": controllers declare a Resource, the guard derives view / manage
 * from the HTTP method, and /auth/me sends the caller's permissions to the
 * dashboard (which never duplicates this map).
 */

export enum Resource {
  Dashboard = 'dashboard',
  Students = 'students',
  Attendance = 'attendance',
  Fees = 'fees',
  Exams = 'exams',
  /** Sections, subjects, years, branches, rooms, teachers, timetables. */
  Academic = 'academic',
  /** Reference data, schedule config, student custom fields. */
  Settings = 'settings',
  Staff = 'staff',
}

export type Action = 'view' | 'manage';

/** Entering marks is separate from managing exams (teachers do the former only). */
export const MARKS_ENTER = 'marks.enter';

export type Permission = `${Resource}.${Action}` | typeof MARKS_ENTER;

export function permission(resource: Resource, action: Action): Permission {
  return `${resource}.${action}`;
}

const view = (...resources: Resource[]) =>
  resources.map((r) => permission(r, 'view'));
const manage = (...resources: Resource[]) =>
  resources.map((r) => permission(r, 'manage'));

const ALL_PERMISSIONS: readonly Permission[] = [
  ...view(...Object.values(Resource)),
  ...manage(...Object.values(Resource)),
  MARKS_ENTER,
];

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  [UserRole.SUPER_ADMIN]: ALL_PERMISSIONS,
  [UserRole.INSTITUTE_ADMIN]: ALL_PERMISSIONS,
  [UserRole.REGISTRAR]: [
    ...view(
      Resource.Dashboard,
      Resource.Students,
      Resource.Attendance,
      Resource.Fees,
      Resource.Exams,
      Resource.Academic,
      Resource.Settings,
    ),
    ...manage(Resource.Students, Resource.Attendance),
  ],
  [UserRole.ACCOUNTANT]: [
    ...view(
      Resource.Dashboard,
      Resource.Students,
      Resource.Fees,
      Resource.Academic,
      Resource.Settings,
    ),
    ...manage(Resource.Fees),
  ],
  // Teacher scope (own sections / subjects) is enforced in the services
  [UserRole.TEACHER]: [
    ...view(Resource.Attendance, Resource.Exams, Resource.Academic),
    ...manage(Resource.Attendance),
    MARKS_ENTER,
  ],
};

/** Roles that may use the admin dashboard. */
export const DASHBOARD_ROLES: readonly string[] = [
  UserRole.SUPER_ADMIN,
  UserRole.INSTITUTE_ADMIN,
  UserRole.REGISTRAR,
  UserRole.ACCOUNTANT,
  UserRole.TEACHER,
];

export function permissionsOf(role: string | undefined | null): Permission[] {
  return role ? [...(ROLE_PERMISSIONS[role] ?? [])] : [];
}

export function hasPermission(
  role: string | undefined | null,
  required: Permission,
): boolean {
  return permissionsOf(role).includes(required);
}

/** GET / HEAD / OPTIONS read (view); every other method changes data (manage). */
export function actionForMethod(method: string): Action {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
    ? 'view'
    : 'manage';
}
