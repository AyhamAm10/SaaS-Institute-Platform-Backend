import { RequestContext } from '../../context/request-context';

type MessageParams = Record<string, string>;

/**
 * Centralized error message registry with i18n support.
 *
 * Messages are keyed by error code and language. The language is resolved
 * automatically from the current request's AsyncLocalStorage context,
 * so services never need to pass language manually.
 *
 * To add a new language: add a new key to `messages` with translations.
 * To add a new error: add the key to ALL language objects.
 */
const messages: Record<string, Record<string, string>> = {
  en: {
    not_found: '{resource} not found',
    already_exists: '{resource} already exists',
    required: '{field} is required',
    invalid_credentials: 'Invalid credentials',
    institute_code_required:
      'This account exists in more than one institute. Please enter the institute code',
    institute_code_invalid:
      'Institute code must be 3-20 latin letters, digits or dashes',
    unauthorized: 'Unauthorized',
    forbidden: 'Access denied',
    lookup_name_duplicate: 'A {resource} with this name already exists',
    lookup_in_use:
      'Cannot delete this {resource}: it is used by {count} record(s)',
    resource_city: 'city',
    resource_school: 'school',
    resource_know_way: 'referral source',
    resource_exam_type: 'exam type',
    resource_bus: 'bus',
    resource_student_status: 'student status',
    bus_branch_mismatch: "The bus does not belong to the student's branch",
    school_city_mismatch: 'The school does not belong to the selected city',
    bus_capacity_exceeded: 'The bus has reached its maximum capacity',
    custom_field_unknown: "Custom field '{field}' does not exist or is inactive",
    custom_field_invalid_number: "Value for '{field}' must be a number",
    custom_field_invalid_date: "Value for '{field}' must be a valid date (YYYY-MM-DD)",
    custom_field_invalid_boolean: "Value for '{field}' must be a boolean",
    custom_field_invalid_option: "Value '{value}' is not a valid option for '{field}'",
    custom_field_invalid_text: "Value for '{field}' must be text",
    custom_field_option_in_use: "Cannot remove option '{option}' because it is used by students",
    custom_field_type_in_use: "Cannot change type of field '{field}' because it has existing data",
    custom_field_filterable_type: "Only SELECT and BOOLEAN fields can be filterable",
    custom_field_not_filterable: "Custom field '{field}' is not filterable",
    custom_filters_invalid_json: 'Invalid customFilters format; must be valid JSON object',
    student_status_default_locked:
      'The default status cannot be deleted or deactivated. Set another default first',
    too_many_requests: 'Too many attempts. Please wait a minute and try again',
    operation_in_progress:
      'This operation is already running. Please wait until it finishes',
    service_unavailable:
      'The service is temporarily unavailable. Please try again shortly',
    feature_disabled: 'This feature is not enabled for your institute',
    file_type_not_allowed: 'File type not allowed (JPG, PNG, WEBP or PDF only)',
    file_too_large: 'File is too large (max 5 MB)',
    file_not_found: 'File not found',
    invalid_type_number: '{field} must be a number',
    invalid_type_array: '{field} must be an array',
    token_expired: 'Token has expired',
    token_invalid: 'Invalid token',
    account_inactive: 'Account is inactive',
    validation_failed: 'Validation failed',
    date_invalid: 'Start date must be before end date',
    academic_year_overlap: 'Academic year dates overlap with an existing year',
    academic_year_not_found: 'Academic year not found',
    section_not_found: 'Section not found',
    branch_not_found: 'Branch not found',
    branch_name_duplicate:
      'Branch with this name already exists in this institute',
    branch_code_duplicate:
      'Branch with this code already exists in this institute',
    academic_year_mismatch: 'Academic year does not belong to this institute',
    branch_mismatch: 'Branch does not belong to this institute',
    section_name_duplicate:
      'Section with this name already exists for this branch and academic year',
    section_academic_year_mismatch:
      'Section does not belong to the specified academic year',
    invalid_fee: 'Fee amount must be a non-negative number',
    academic_branch_not_found: 'Academic branch not found',
    academic_branch_mismatch:
      'Academic branch does not belong to this institute',
    academic_branch_name_duplicate:
      'Academic branch with this name already exists in this institute',
    academic_branch_has_sections:
      'Cannot delete academic branch because it is linked to existing sections',
    subject_not_found: 'Subject not found',
    subject_name_duplicate:
      'Subject with this name already exists in this institute',
    subject_code_duplicate:
      'Subject with this code already exists in this institute',
    subject_mismatch: 'Subject does not belong to this institute',
    subject_has_sections:
      'Cannot delete subject because it is assigned to sections',
    section_subject_already_exists:
      'Subject is already assigned to this section',
    section_subject_not_found: 'Subject is not assigned to this section',
    teacher_not_found: 'Teacher not found',
    teacher_phone_duplicate: 'A user with this phone number already exists',
    teacher_mismatch: 'Teacher does not belong to this institute',
    teacher_assignment_duplicate:
      'Teacher is already assigned to this academic branch and subject',
    teacher_assignment_not_found: 'Teacher assignment not found',
    teacher_not_qualified:
      'Teacher is not assigned/qualified to teach this subject in this academic branch',
    room_not_found: 'Room not found',
    room_name_duplicate:
      'A room with this name already exists in this institute',
    room_mismatch: 'Room does not belong to this institute',
    invalid_day_of_week: 'Invalid day of week (must be 0 to 6)',
    invalid_time_range: 'Start time must be before end time',
    overlapping_availability:
      'Availability intervals cannot overlap on the same day',
    schedule_config_invalid_times:
      'Institute schedule start time must be before end time',
    schedule_config_invalid_break:
      'Break times must fall within working hours and start before end',
    schedule_config_no_periods:
      'The configured duration and working hours cannot fit any periods',
    timetable_not_found: 'Timetable not found',
    timetable_entry_conflict: 'Scheduling conflict detected for this slot',
    timetable_generation_failed:
      'Unable to generate valid timetable due to hard constraint conflicts',
    timetable_slot_unavailable:
      'Requested time slot is outside available working hours or during a break',
    section_branch_mismatch: 'Section does not belong to the active branch',
    room_branch_mismatch: 'Room does not belong to the active branch',
    student_branch_mismatch: 'Student does not belong to the active branch',
    student_enrolled_in_other_branch:
      'Student has an active enrollment in a section of another branch',
    family_has_students: 'Cannot delete a family that still has students',
    teacher_not_assigned_to_branch: 'Teacher is not assigned to this branch',
    enrollment_student_not_found: 'Student not found',
    enrollment_branch_mismatch:
      'The student belongs to a different branch than the section',
    enrollment_already_in_year:
      'The student is already enrolled in this academic year',
    enrollment_not_active: 'Only an active enrollment can be changed this way',
    enrollment_same_section: 'The student is already in this section',
    enrollment_transfer_other_year:
      'Transfers are only allowed within the same academic year',
    enrollment_transfer_other_branch:
      'Transfers are only allowed within the same branch',
    enrollment_invalid_status_transition:
      'This enrollment status change is not allowed',
    enrollment_withdraw_reason_required:
      'A reason is required to withdraw a student',
    enrollment_subject_not_in_section:
      'Some subjects are not part of the section plan',
    money_invalid_precision:
      'SYP amounts have no fractions; USD amounts have at most two decimals',
    contract_exists: 'This enrollment already has a contract',
    contract_enrollment_not_active:
      'A contract can only be created for an active enrollment',
    contract_discount_exceeds: 'The discount cannot exceed the gross amount',
    contract_first_payment_invalid:
      'The first payment must be less than the total after discount',
    contract_installments_required:
      'The number of installments must be between 1 and 60',
    contract_total_below_paid:
      'The new total is less than what is already paid or locked in paid installments',
    contract_not_active: 'The contract is not active',
    payment_exceeds_remaining:
      'The payment ({amount}) is larger than the remaining balance ({remaining})',
    payment_rate_required:
      'An exchange rate is required when paying in a currency other than the contract currency',
    payment_amount_invalid: 'The payment amount must be greater than zero',
    payment_already_cancelled: 'This payment is already cancelled',
    payment_cancel_reason_required: 'A reason is required to cancel a payment',
    attendance_not_enrolled:
      'Only students with an active enrollment can check in',
    attendance_not_working_day: 'This day is not a working day',
    attendance_already_checked_in: 'The student already checked in today',
    attendance_check_out_before_in: 'The student has not checked in yet',
    attendance_already_checked_out: 'The student already checked out today',
    attendance_invalid_times: 'Check-out must be after check-in',
    attendance_future_time: 'The time cannot be in the future',
    exam_subject_not_in_section: 'The subject is not part of the section plan',
    exam_date_outside_year:
      'The exam date is outside the section academic year',
    exam_invalid_marks:
      'The pass mark must be greater than 0 and not above the maximum mark',
    exam_has_results:
      'This exam already has {count} mark(s); confirm to delete it with its marks',
    exam_mark_out_of_range: 'Marks must be between 0 and {max}',
    exam_student_not_eligible:
      'The student is not enrolled in this subject of the section',
    exam_max_below_marks:
      'The maximum mark is lower than marks already entered',
    permission_denied: 'You do not have permission for this action',
    teacher_not_linked: 'This account is not linked to a teacher',
    teacher_scope_subject: 'You do not teach this subject in this section',
    teacher_scope_section: 'You do not teach in this section',
    staff_phone_duplicate:
      'A user with this phone already exists in the institute',
    staff_self_change:
      'You cannot change your own role or deactivate your own account',
    staff_last_admin: 'At least one active institute admin must remain',
    staff_password_short: 'The password must be at least 8 characters',
    staff_invalid_role: 'This role cannot be managed from the staff screen',
    report_not_found: 'Report not found',
    report_param_required: 'This report needs: {param}',
    report_no_academic_year: 'There is no academic year yet',
    context_branch_invalid: 'The selected branch does not belong to your institute',
    context_year_invalid: 'The selected academic year does not belong to your institute',
    context_mismatch: 'This value must match the branch / academic year selected in the header',
    invalid_timezone: 'Invalid IANA time zone',
    mobile_account_phone_duplicate:
      'A user with this phone already exists in the institute',
    student_already_has_account:
      'This student already has an active mobile account',
    mobile_account_invalid_role:
      'Target user is not a mobile account (family or student)',
    mobile_account_inactive: 'This account is deactivated or no longer exists',
    mobile_finance_family_only: 'Financial data is available to guardians only',
  },
  ar: {
    not_found: '{resource} غير موجود',
    already_exists: '{resource} موجود بالفعل',
    required: '{field} مطلوب',
    invalid_credentials: 'بيانات الاعتماد غير صالحة',
    institute_code_required:
      'هذا الحساب موجود بأكثر من معهد. يرجى إدخال كود المعهد',
    institute_code_invalid:
      'كود المعهد يجب أن يكون من 3 إلى 20 حرفاً لاتينياً أو رقماً أو شرطة',
    unauthorized: 'غير مصرح',
    forbidden: 'تم رفض الوصول',
    lookup_name_duplicate: 'يوجد {resource} بنفس الاسم',
    lookup_in_use:
      'لا يمكن الحذف: هذا العنصر ({resource}) مستخدم في {count} سجل',
    resource_city: 'مدينة',
    resource_school: 'مدرسة',
    resource_know_way: 'طريقة معرفة',
    resource_exam_type: 'نوع مذاكرة',
    resource_bus: 'باص',
    resource_student_status: 'حالة طالب',
    bus_branch_mismatch: 'الباص لا يتبع لفرع الطالب',
    school_city_mismatch: 'المدرسة لا تتبع للمدينة المحددة',
    bus_capacity_exceeded: 'تم الوصول إلى سعة الحافلة القصوى',
    custom_field_unknown: "الحقل المخصص '{field}' غير موجود أو غير مفعّل",
    custom_field_invalid_number: "قيمة الحقل '{field}' يجب أن تكون رقماً",
    custom_field_invalid_date: "قيمة الحقل '{field}' يجب أن تكون تاريخاً صالحاً (YYYY-MM-DD)",
    custom_field_invalid_boolean: "قيمة الحقل '{field}' يجب أن تكون قيمة منطقية (نعم/لا)",
    custom_field_invalid_option: "القيمة '{value}' ليست خياراً متاحاً للحقل '{field}'",
    custom_field_invalid_text: "قيمة الحقل '{field}' يجب أن تكون نصاً",
    custom_field_option_in_use: "لا يمكن حذف الخيار '{option}' لأنه مستخدم لدى بعض الطلاب",
    custom_field_type_in_use: "لا يمكن تغيير نوع الحقل '{field}' لوجود بيانات مسجلة به",
    custom_field_filterable_type: "فقط حقول الاختيار (SELECT) والحقول المنطقية (BOOLEAN) يمكن جعلها قابلة للفلترة",
    custom_field_not_filterable: "الحقل المخصص '{field}' غير قابل للفلترة",
    custom_filters_invalid_json: 'صيغة الفلاتر المخصصة غير صحيحة، يجب أن تكون كائن JSON صالح',
    student_status_default_locked:
      'لا يمكن حذف الحالة الافتراضية أو إيقافها. حدد حالة افتراضية أخرى أولاً',
    too_many_requests:
      'محاولات كثيرة جداً. يرجى الانتظار دقيقة ثم المحاولة مجدداً',
    operation_in_progress:
      'هذه العملية قيد التنفيذ حالياً. يرجى الانتظار حتى تنتهي',
    service_unavailable: 'الخدمة غير متاحة مؤقتاً. يرجى المحاولة بعد قليل',
    feature_disabled: 'هذه الميزة غير مفعلة لمعهدك',
    file_type_not_allowed:
      'نوع الملف غير مسموح (JPG أو PNG أو WEBP أو PDF فقط)',
    file_too_large: 'حجم الملف كبير (الحد الأقصى 5 ميغابايت)',
    file_not_found: 'الملف غير موجود',
    invalid_type_number: '{field} يجب أن يكون رقماً',
    invalid_type_array: '{field} يجب أن يكون مصفوفة',
    token_expired: 'انتهت صلاحية الرمز',
    token_invalid: 'رمز غير صالح',
    account_inactive: 'الحساب غير نشط',
    validation_failed: 'فشل التحقق',
    date_invalid: 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية',
    academic_year_overlap: 'تواريخ السنة الدراسية تتداخل مع سنة دراسية أخرى',
    academic_year_not_found: 'السنة الدراسية غير موجودة',
    section_not_found: 'الشعبة غير موجودة',
    branch_not_found: 'الفرع غير موجود',
    branch_name_duplicate: 'يوجد فرع بنفس الاسم في هذا المعهد',
    branch_code_duplicate: 'يوجد فرع بنفس الرمز في هذا المعهد',
    academic_year_mismatch: 'السنة الدراسية لا تتبع لهذا المعهد',
    branch_mismatch: 'الفرع لا يتبع لهذا المعهد',
    section_name_duplicate: 'يوجد شعبة بنفس الاسم في هذا الفرع والسنة الدراسية',
    section_academic_year_mismatch: 'الشعبة لا تتبع للسنة الدراسية المحددة',
    invalid_fee: 'مبلغ الرسوم يجب أن يكون رقماً غير سالب',
    academic_branch_not_found: 'الفرع الأكاديمي غير موجود',
    academic_branch_mismatch: 'الفرع الأكاديمي لا يتبع لهذا المعهد',
    academic_branch_name_duplicate: 'يوجد فرع أكاديمي بنفس الاسم في هذا المعهد',
    academic_branch_has_sections:
      'لا يمكن حذف الفرع الأكاديمي لوجود شُعب دراسية مرتبطة به',
    subject_not_found: 'المادة الدراسية غير موجودة',
    subject_name_duplicate: 'يوجد مادة دراسية بنفس الاسم في هذا المعهد',
    subject_code_duplicate: 'يوجد مادة دراسية بنفس الرمز في هذا المعهد',
    subject_mismatch: 'المادة الدراسية لا تتبع لهذا المعهد',
    subject_has_sections: 'لا يمكن حذف المادة الدراسية لتعيينها لشُعب دراسية',
    section_subject_already_exists: 'المادة الدراسية معينة بالفعل لهذه الشُعبة',
    section_subject_not_found: 'المادة الدراسية غير معينة لهذه الشُعبة',
    teacher_not_found: 'المعلم غير موجود',
    teacher_phone_duplicate: 'رقم الهاتف مستخدم بالفعل لمستخدم آخر',
    teacher_mismatch: 'المعلم لا يتبع لهذا المعهد',
    teacher_assignment_duplicate:
      'المعلم مؤهل ومعين بالفعل لهذا الفرع الأكاديمي والمادة',
    teacher_assignment_not_found: 'تعيين المعلم غير موجود',
    teacher_not_qualified:
      'المعلم غير مؤهل أو غير مسند لتدريس هذه المادة في هذا الفرع الأكاديمي',
    room_not_found: 'القاعة الدراسية غير موجودة',
    room_name_duplicate: 'يوجد قاعة دراسية بنفس الاسم في هذا المعهد',
    room_mismatch: 'القاعة الدراسية لا تتبع لهذا المعهد',
    invalid_day_of_week: 'اليوم غير صالح (يجب أن يكون بين 0 و 6)',
    invalid_time_range: 'وقت البداية يجب أن يكون قبل وقت النهاية',
    overlapping_availability: 'فترات التوفر لا يمكن أن تتداخل في نفس اليوم',
    schedule_config_invalid_times:
      'وقت بداية الدوام يجب أن يكون قبل وقت النهاية',
    schedule_config_invalid_break:
      'أوقات الاستراحة يجب أن تقع ضمن أوقات الدوام وتكون البداية قبل النهاية',
    schedule_config_no_periods:
      'الإعدادات المدخلة لا تسمح بإنشاء أي حصص دراسية ضمن ساعات الدوام',
    timetable_not_found: 'الجدول الدراسي غير موجود',
    timetable_entry_conflict: 'تم اكتشاف تعارض في الحصة الدراسية المحددة',
    timetable_generation_failed:
      'تعذر توليد جدول صالح بسبب وجود تعارضات غير قابلة للحل في القيود الأساسية',
    timetable_slot_unavailable:
      'الحصة المطلوبة تقع خارج ساعات الدوام أو خلال فترة استراحة',
    section_branch_mismatch: 'الشعبة لا تتبع للفرع الحالي',
    room_branch_mismatch: 'القاعة لا تتبع للفرع الحالي',
    student_branch_mismatch: 'الطالب لا يتبع للفرع الحالي',
    student_enrolled_in_other_branch:
      'الطالب مسجل حالياً في شعبة تابعة لفرع آخر',
    family_has_students: 'لا يمكن حذف عائلة ما زال لديها طلاب',
    teacher_not_assigned_to_branch: 'المعلم غير مسجل في هذا الفرع',
    enrollment_student_not_found: 'الطالب غير موجود',
    enrollment_branch_mismatch: 'الطالب تابع لفرع غير فرع الشعبة',
    enrollment_already_in_year:
      'الطالب مسجل مسبقاً بشعبة في هذه السنة الدراسية',
    enrollment_not_active: 'لا يمكن تنفيذ العملية إلا على تسجيل فعّال',
    enrollment_same_section: 'الطالب موجود أصلاً في هذه الشعبة',
    enrollment_transfer_other_year: 'النقل مسموح فقط ضمن نفس السنة الدراسية',
    enrollment_transfer_other_branch: 'النقل مسموح فقط ضمن نفس الفرع',
    enrollment_invalid_status_transition:
      'لا يمكن تغيير حالة التسجيل إلى الحالة المطلوبة',
    enrollment_withdraw_reason_required: 'سبب الانسحاب مطلوب',
    enrollment_subject_not_in_section: 'بعض المواد غير موجودة في خطة الشعبة',
    money_invalid_precision:
      'المبالغ بالليرة السورية بدون كسور، وبالدولار برقمين بعد الفاصلة كحد أقصى',
    contract_exists: 'يوجد عقد لهذا التسجيل مسبقاً',
    contract_enrollment_not_active: 'لا يمكن إنشاء عقد إلا لتسجيل فعّال',
    contract_discount_exceeds: 'الحسم لا يمكن أن يتجاوز المبلغ الإجمالي',
    contract_first_payment_invalid:
      'الدفعة الأولى يجب أن تكون أقل من المبلغ بعد الحسم',
    contract_installments_required: 'عدد الأقساط يجب أن يكون بين 1 و 60',
    contract_total_below_paid:
      'المبلغ الجديد أقل من المدفوع أو من الأقساط المدفوعة',
    contract_not_active: 'العقد غير فعّال',
    payment_exceeds_remaining:
      'المبلغ ({amount}) أكبر من المتبقي على العقد ({remaining})',
    payment_rate_required: 'سعر الصرف مطلوب عند الدفع بعملة غير عملة العقد',
    payment_amount_invalid: 'مبلغ الدفعة يجب أن يكون أكبر من صفر',
    payment_already_cancelled: 'هذه الدفعة ملغاة مسبقاً',
    payment_cancel_reason_required: 'سبب إلغاء الدفعة مطلوب',
    attendance_not_enrolled:
      'لا يمكن تسجيل الدخول إلا لطالب مسجل بشعبة بحالة فعّال',
    attendance_not_working_day: 'هذا اليوم ليس يوم دوام',
    attendance_already_checked_in: 'الطالب سجّل دخوله اليوم مسبقاً',
    attendance_check_out_before_in: 'الطالب لم يسجّل دخوله بعد',
    attendance_already_checked_out: 'الطالب سجّل انصرافه اليوم مسبقاً',
    attendance_invalid_times: 'وقت الانصراف يجب أن يكون بعد وقت الدخول',
    attendance_future_time: 'لا يمكن أن يكون الوقت في المستقبل',
    exam_subject_not_in_section: 'المادة غير موجودة في خطة الشعبة',
    exam_date_outside_year: 'تاريخ المذاكرة خارج السنة الدراسية للشعبة',
    exam_invalid_marks:
      'علامة النجاح يجب أن تكون أكبر من صفر ولا تتجاوز العلامة العظمى',
    exam_has_results:
      'هذه المذاكرة فيها {count} علامة؛ أكّد الحذف لحذفها مع علاماتها',
    exam_mark_out_of_range: 'العلامات يجب أن تكون بين 0 و {max}',
    exam_student_not_eligible: 'الطالب غير مسجل بهذه المادة في الشعبة',
    exam_max_below_marks: 'العلامة العظمى أقل من علامات مُدخلة مسبقاً',
    permission_denied: 'لا تملك صلاحية لهذه العملية',
    teacher_not_linked: 'هذا الحساب غير مرتبط بمدرّس',
    teacher_scope_subject: 'لا تدرّس هذه المادة في هذه الشعبة',
    teacher_scope_section: 'لا تدرّس في هذه الشعبة',
    staff_phone_duplicate: 'يوجد مستخدم بنفس رقم الهاتف في المعهد',
    staff_self_change: 'لا يمكنك تغيير دورك أو إيقاف حسابك',
    staff_last_admin: 'يجب أن يبقى مدير معهد فعّال واحد على الأقل',
    staff_password_short: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
    staff_invalid_role: 'لا يمكن إدارة هذا الدور من شاشة الموظفين',
    report_not_found: 'التقرير غير موجود',
    report_param_required: 'هذا التقرير يحتاج: {param}',
    report_no_academic_year: 'لا توجد سنة دراسية بعد',
    context_branch_invalid: 'الفرع المختار لا يتبع لمعهدك',
    context_year_invalid: 'السنة الدراسية المختارة لا تتبع لمعهدك',
    context_mismatch: 'هذه القيمة يجب أن تطابق الفرع / السنة المختارين في الأعلى',
    invalid_timezone: 'المنطقة الزمنية غير صالحة',
    mobile_account_phone_duplicate:
      'يوجد مستخدم آخر بنفس رقم الهاتف في هذا المعهد',
    student_already_has_account:
      'هذا الطالب لديه حساب تطبيق بالفعل',
    mobile_account_invalid_role:
      'المستخدم المحدد ليس حساب تطبيق (ولي أمر أو طالب)',
    mobile_account_inactive: 'هذا الحساب معطّل أو لم يعد موجودًا',
    mobile_finance_family_only: 'البيانات المالية متاحة لولي الأمر فقط',
  },
};

export class ErrorMessages {
  /**
   * Resolve an error message by key, interpolating parameters.
   * Language is automatically resolved from the request context.
   *
   * @param key   - The message key (e.g., 'not_found')
   * @param params - Template parameters (e.g., { resource: 'User' })
   */
  static get(key: string, params: MessageParams = {}): string {
    const language = RequestContext.getLanguage();
    const langMessages = messages[language] ?? messages['en'];
    let message = langMessages?.[key] ?? messages['en']?.[key] ?? key;

    for (const [param, value] of Object.entries(params)) {
      message = message.replace(`{${param}}`, value);
    }

    return message;
  }

  /** Check if a language is supported. */
  static isSupported(language: string): boolean {
    return language in messages;
  }

  /** Get the list of supported languages. */
  static supportedLanguages(): string[] {
    return Object.keys(messages);
  }
}
