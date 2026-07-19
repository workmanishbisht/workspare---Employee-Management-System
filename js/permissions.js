/* ==========================================================
   ROLES
========================================================== */

export const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  HR: "hr",
  MANAGER: "manager",
  EMPLOYEE: "employee",
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));

/* ==========================================================
   MODULES
========================================================== */

export const MODULES = Object.freeze({
  DASHBOARD: "dashboard",
  EMPLOYEES: "employees",
  DEPARTMENTS: "departments",
  ATTENDANCE: "attendance",
  LEAVE_MANAGEMENT: "leaveManagement",
  LEAVE_CALENDAR: "leaveCalendar",
  PAYROLL: "payroll",
  HOLIDAYS: "holidays",
  DOCUMENTS: "documents",
  NOTIFICATIONS: "notifications",
  REPORTS: "reports",
  HELP_CENTER: "helpCenter",
  SETTINGS: "settings",
  PROFILE: "profile",
});

export const ALL_MODULES = Object.freeze(Object.values(MODULES));

/* ==========================================================
   ACTIONS
========================================================== */

export const ACTIONS = Object.freeze({
  VIEW: "view",
  CREATE: "create",
  EDIT: "edit",
  DELETE: "delete",
  EXPORT: "export",
  APPROVE: "approve",
  REJECT: "reject",
  RUN: "run",
  GENERATE: "generate",
});

/* ==========================================================
   MODULE ROUTES
========================================================== */

export const MODULE_ROUTES = Object.freeze({
  [MODULES.DASHBOARD]: ["dashboard.html"],

  [MODULES.EMPLOYEES]: ["employees.html", "employee-details.html"],

  [MODULES.DEPARTMENTS]: ["departments.html"],

  [MODULES.ATTENDANCE]: ["attendance.html"],

  [MODULES.LEAVE_MANAGEMENT]: ["leave-management.html"],

  [MODULES.LEAVE_CALENDAR]: ["leave-calendar.html"],

  [MODULES.PAYROLL]: ["payroll.html", "payslip.html"],

  [MODULES.HOLIDAYS]: ["holiday.html"],

  [MODULES.DOCUMENTS]: ["documents.html"],

  [MODULES.NOTIFICATIONS]: ["notifications.html"],

  [MODULES.REPORTS]: ["reports.html"],

  [MODULES.HELP_CENTER]: ["help-center.html"],

  [MODULES.SETTINGS]: ["settings.html"],

  [MODULES.PROFILE]: ["profile.html"],
});

/* ==========================================================
   INTERNAL HELPERS
========================================================== */

function normalizeRole(role) {
  return String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function buildActionPermissions(value = false) {
  return {
    [ACTIONS.VIEW]: value,
    [ACTIONS.CREATE]: value,
    [ACTIONS.EDIT]: value,
    [ACTIONS.DELETE]: value,
    [ACTIONS.EXPORT]: value,
    [ACTIONS.APPROVE]: value,
    [ACTIONS.REJECT]: value,
    [ACTIONS.RUN]: value,
    [ACTIONS.GENERATE]: value,
  };
}

function buildModulePermissions(defaultValue = false) {
  const modules = {};

  ALL_MODULES.forEach((moduleKey) => {
    modules[moduleKey] = buildActionPermissions(defaultValue);
  });

  return modules;
}

function mergePermissions(base, overrides = {}) {
  const result = structuredClone(base);

  Object.entries(overrides).forEach(([moduleKey, actions]) => {
    result[moduleKey] = {
      ...result[moduleKey],
      ...actions,
    };
  });

  return result;
}

/* ==========================================================
   PERMISSION MATRIX
========================================================== */

export const PERMISSIONS = Object.freeze({
  /* ------------------------------------ */
  /* SUPER ADMIN                          */
  /* ------------------------------------ */

  [ROLES.SUPER_ADMIN]: mergePermissions(buildModulePermissions(true)),

  /* ------------------------------------ */
  /* ADMIN                                */
  /* ------------------------------------ */

  [ROLES.ADMIN]: mergePermissions(buildModulePermissions(true)),

  /* ------------------------------------ */
  /* HR                                   */
  /* ------------------------------------ */

  [ROLES.HR]: mergePermissions(
    buildModulePermissions(true),

    {
      [MODULES.SETTINGS]: {
        view: false,
        create: false,
        edit: false,
        delete: false,
      },
    },
  ),

  /* ------------------------------------ */
  /* MANAGER                              */
  /* ------------------------------------ */

  [ROLES.MANAGER]: mergePermissions(
    buildModulePermissions(false),

    {
      [MODULES.DASHBOARD]: {
        view: true,
      },

      [MODULES.EMPLOYEES]: {
        view: true,
      },

      [MODULES.ATTENDANCE]: {
        view: true,
        approve: true,
      },

      [MODULES.LEAVE_MANAGEMENT]: {
        view: true,
        approve: true,
        reject: true,
      },

      [MODULES.LEAVE_CALENDAR]: {
        view: true,
      },

      [MODULES.HOLIDAYS]: {
        view: true,
      },

      [MODULES.DOCUMENTS]: {
        view: true,
      },

      [MODULES.NOTIFICATIONS]: {
        view: true,
      },

      [MODULES.REPORTS]: {
        view: true,
        export: true,
      },

      [MODULES.HELP_CENTER]: {
        view: true,
      },

      [MODULES.PROFILE]: {
        view: true,
        edit: true,
      },
    },
  ),

  /* ------------------------------------ */
  /* EMPLOYEE                             */
  /* ------------------------------------ */

  [ROLES.EMPLOYEE]: mergePermissions(
    buildModulePermissions(false),

    {
      [MODULES.DASHBOARD]: {
        view: true,
      },

      [MODULES.ATTENDANCE]: {
        view: true,
      },

      [MODULES.LEAVE_MANAGEMENT]: {
        view: true,
        create: true,
      },

      [MODULES.LEAVE_CALENDAR]: {
        view: true,
      },

      [MODULES.DOCUMENTS]: {
        view: true,
      },

      [MODULES.NOTIFICATIONS]: {
        view: true,
      },

      [MODULES.HELP_CENTER]: {
        view: true,
      },

      [MODULES.PROFILE]: {
        view: true,
        edit: true,
      },
    },
  ),
});

const FALLBACK_ROLE = ROLES.EMPLOYEE;

/* ==========================================================
   PERMISSION ENGINE
========================================================== */

let currentUserRole = FALLBACK_ROLE;

function normalizeAction(action) {
  return String(action ?? "")
    .trim()
    .toLowerCase();
}

/* ==========================================================
   ROLE HELPERS
========================================================== */

export function isValidRole(role) {
  return ALL_ROLES.includes(normalizeRole(role));
}

export function isSuperAdmin(role = currentUserRole) {
  return normalizeRole(role) === ROLES.SUPER_ADMIN;
}

export function isAdmin(role = currentUserRole) {
  const key = normalizeRole(role);
  return key === ROLES.ADMIN || key === ROLES.SUPER_ADMIN;
}

export function isHR(role = currentUserRole) {
  return normalizeRole(role) === ROLES.HR;
}

export function isManager(role = currentUserRole) {
  return normalizeRole(role) === ROLES.MANAGER;
}

export function isEmployee(role = currentUserRole) {
  return normalizeRole(role) === ROLES.EMPLOYEE;
}

/* ==========================================================
   CURRENT ROLE
========================================================== */

export function setCurrentRole(role) {
  currentUserRole = isValidRole(role) ? normalizeRole(role) : FALLBACK_ROLE;

  return currentUserRole;
}

export function getCurrentRole() {
  return currentUserRole;
}

/* ==========================================================
   ROLE PERMISSIONS
========================================================== */

export function getRolePermissions(role = currentUserRole) {
  const key = normalizeRole(role);

  return PERMISSIONS[key] || PERMISSIONS[FALLBACK_ROLE];
}

/* ==========================================================
   MODULE CHECK
========================================================== */

export function checkModule(moduleKey) {
  return hasPermission(currentUserRole, moduleKey, ACTIONS.VIEW);
}

/* ==========================================================
   ACTION CHECK
========================================================== */

export function hasPermission(role, moduleKey, action = ACTIONS.VIEW) {
  if (!ALL_MODULES.includes(moduleKey)) return false;

  if (!Object.values(ACTIONS).includes(normalizeAction(action))) return false;

  const permissions = getRolePermissions(role);

  if (!permissions[moduleKey]) return false;

  return permissions[moduleKey][normalizeAction(action)] === true;
}

/* ==========================================================
   CURRENT USER PERMISSION
========================================================== */

export function checkPermission(moduleKey, action = ACTIONS.VIEW) {
  return hasPermission(currentUserRole, moduleKey, action);
}

/* ==========================================================
   GET ALLOWED MODULES
========================================================== */

export function getAllowedModules(role = currentUserRole) {
  const permissions = getRolePermissions(role);

  return ALL_MODULES.filter((moduleKey) => {
    return permissions[moduleKey]?.view === true;
  });
}

/* ==========================================================
   GET DENIED MODULES
========================================================== */

export function getDeniedModules(role = currentUserRole) {
  const permissions = getRolePermissions(role);

  return ALL_MODULES.filter((moduleKey) => {
    return permissions[moduleKey]?.view !== true;
  });
}

/* ==========================================================
   DEBUG
========================================================== */

export function printPermissions(role = currentUserRole) {
  console.table(getRolePermissions(role));
}

/* ==========================================================
   FIREBASE ROLE LOADER
========================================================== */

let currentUid = null;

export async function loadPermissions(uid, role = null) {
  currentUid = uid;

  // Agar role layout.js se mil gaya hai
  if (role) {
    setCurrentRole(role);
    return getCurrentRole();
  }

  // Safety fallback
  setCurrentRole(FALLBACK_ROLE);

  return getCurrentRole();
}

/* ==========================================================
   REFRESH PERMISSIONS
========================================================== */

export async function refreshPermissions(role = null) {
  if (role) {
    setCurrentRole(role);
  }

  return getCurrentRole();
}

/* ==========================================================
   CURRENT UID
========================================================== */

export function getCurrentUid() {
  return currentUid;
}

/* ==========================================================
   CURRENT USER
========================================================== */

export function getPermissionState() {
  return {
    uid: currentUid,
    role: currentUserRole,
    permissions: getRolePermissions(currentUserRole),
  };
}

/* ==========================================================
   ROUTE HELPERS
========================================================== */

function getCurrentFilename() {
  return window.location.pathname.split("/").pop();
}

function getCurrentModule() {
  const filename = getCurrentFilename();

  for (const [moduleKey, pages] of Object.entries(MODULE_ROUTES)) {
    if (pages.includes(filename)) {
      return moduleKey;
    }
  }

  return null;
}

/* ==========================================================
   ROUTE GUARD
========================================================== */

export function enforceRouteGuard() {
  const moduleKey = getCurrentModule();

  // Page isn't registered
  if (!moduleKey) {
    return true;
  }

  // Allowed
  if (checkModule(moduleKey)) {
    return true;
  }

  console.warn("[RBAC] Access denied:", currentUserRole, "->", moduleKey);

  // Prevent redirect loop
  const page = getCurrentFilename();

  if (page !== "dashboard.html") {
    window.location.replace("./dashboard.html");
  }

  return false;
}

/* ==========================================================
   NAVIGATION HELPERS
========================================================== */

export function canOpenPage(fileName) {
  for (const [moduleKey, pages] of Object.entries(MODULE_ROUTES)) {
    if (pages.includes(fileName)) {
      return checkModule(moduleKey);
    }
  }

  return true;
}

/* ==========================================================
   MENU HELPERS
========================================================== */

export function shouldShowModule(moduleKey) {
  return checkModule(moduleKey);
}

export function shouldHideModule(moduleKey) {
  return !checkModule(moduleKey);
}

/* ==========================================================
   RESET
========================================================== */

export function clearPermissions() {
  currentUid = null;

  setCurrentRole(FALLBACK_ROLE);
}

/* ==========================================================
   PUBLIC HELPERS
========================================================== */

/**
 * Check whether current user can view a module.
 */
export function canView(moduleKey) {
  return checkPermission(moduleKey, ACTIONS.VIEW);
}

/**
 * Check whether current user can create.
 */
export function canCreate(moduleKey) {
  return checkPermission(moduleKey, ACTIONS.CREATE);
}

/**
 * Check whether current user can edit.
 */
export function canEdit(moduleKey) {
  return checkPermission(moduleKey, ACTIONS.EDIT);
}

/**
 * Check whether current user can delete.
 */
export function canDelete(moduleKey) {
  return checkPermission(moduleKey, ACTIONS.DELETE);
}

/**
 * Check export permission.
 */
export function canExport(moduleKey) {
  return checkPermission(moduleKey, ACTIONS.EXPORT);
}

/**
 * Check approve permission.
 */
export function canApprove(moduleKey) {
  return checkPermission(moduleKey, ACTIONS.APPROVE);
}

/**
 * Check reject permission.
 */
export function canReject(moduleKey) {
  return checkPermission(moduleKey, ACTIONS.REJECT);
}

/**
 * Check run permission.
 */
export function canRun(moduleKey) {
  return checkPermission(moduleKey, ACTIONS.RUN);
}

/**
 * Check generate permission.
 */
export function canGenerate(moduleKey) {
  return checkPermission(moduleKey, ACTIONS.GENERATE);
}

/* ==========================================================
   ROLE LABEL
========================================================== */

export function getRoleLabel(role = currentUserRole) {
  switch (normalizeRole(role)) {
    case ROLES.SUPER_ADMIN:
      return "Super Admin";

    case ROLES.ADMIN:
      return "Admin";

    case ROLES.HR:
      return "HR";

    case ROLES.MANAGER:
      return "Manager";

    case ROLES.EMPLOYEE:
      return "Employee";

    default:
      return "Employee";
  }
}

/* ==========================================================
   DASHBOARD SUMMARY
========================================================== */

export function getPermissionSummary(role = currentUserRole) {
  const allowed = getAllowedModules(role);

  return {
    role: normalizeRole(role),
    roleLabel: getRoleLabel(role),
    modules: allowed,
    totalModules: allowed.length,
  };
}

/* ==========================================================
   DEBUG MODE
========================================================== */

export function logPermissions(role = currentUserRole) {
  console.group("RBAC");

  console.log("Role:", role);

  console.log("Allowed Modules:");

  console.table(getAllowedModules(role));

  console.log("Permission Matrix:");

  console.table(getRolePermissions(role));

  console.groupEnd();
}

/* ==========================================================
   DEFAULT EXPORT
========================================================== */

export default {
  ROLES,
  MODULES,
  ACTIONS,

  MODULE_ROUTES,

  PERMISSIONS,

  setCurrentRole,
  getCurrentRole,

  getRolePermissions,

  hasPermission,

  checkPermission,

  checkModule,

  getAllowedModules,

  getDeniedModules,

  loadPermissions,

  refreshPermissions,

  enforceRouteGuard,

  shouldShowModule,

  shouldHideModule,

  canView,
  canCreate,
  canEdit,
  canDelete,
  canExport,
  canApprove,
  canReject,
  canRun,
  canGenerate,

  isAdmin,
  isSuperAdmin,
  isHR,
  isManager,
  isEmployee,

  getPermissionState,

  getPermissionSummary,

  clearPermissions,

  logPermissions,
};
