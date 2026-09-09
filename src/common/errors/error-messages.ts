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
    unauthorized: 'Unauthorized',
    forbidden: 'Access denied',
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
    academic_year_mismatch: 'Academic year does not belong to this institute',
    branch_mismatch: 'Branch does not belong to this institute',
    section_name_duplicate: 'Section with this name already exists for this branch and academic year',
    section_academic_year_mismatch: 'Section does not belong to the specified academic year',
    invalid_fee: 'Fee amount must be a non-negative number',
    academic_branch_not_found: 'Academic branch not found',
    academic_branch_mismatch: 'Academic branch does not belong to this institute',
    academic_branch_name_duplicate: 'Academic branch with this name already exists in this institute',
    academic_branch_has_sections: 'Cannot delete academic branch because it is linked to existing sections',
    subject_not_found: 'Subject not found',
    subject_code_duplicate: 'Subject with this code already exists in this institute',
    subject_mismatch: 'Subject does not belong to this institute',
    subject_has_sections: 'Cannot delete subject because it is assigned to sections',
    section_subject_already_exists: 'Subject is already assigned to this section',
    section_subject_not_found: 'Subject is not assigned to this section',
  },
  ar: {
    not_found: '{resource} غير موجود',
    already_exists: '{resource} موجود بالفعل',
    required: '{field} مطلوب',
    invalid_credentials: 'بيانات الاعتماد غير صالحة',
    unauthorized: 'غير مصرح',
    forbidden: 'تم رفض الوصول',
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
    academic_year_mismatch: 'السنة الدراسية لا تتبع لهذا المعهد',
    branch_mismatch: 'الفرع لا يتبع لهذا المعهد',
    section_name_duplicate: 'يوجد شعبة بنفس الاسم في هذا الفرع والسنة الدراسية',
    section_academic_year_mismatch: 'الشعبة لا تتبع للسنة الدراسية المحددة',
    invalid_fee: 'مبلغ الرسوم يجب أن يكون رقماً غير سالب',
    academic_branch_not_found: 'الفرع الأكاديمي غير موجود',
    academic_branch_mismatch: 'الفرع الأكاديمي لا يتبع لهذا المعهد',
    academic_branch_name_duplicate: 'يوجد فرع أكاديمي بنفس الاسم في هذا المعهد',
    academic_branch_has_sections: 'لا يمكن حذف الفرع الأكاديمي لوجود شُعب دراسية مرتبطة به',
    subject_not_found: 'المادة الدراسية غير موجودة',
    subject_code_duplicate: 'يوجد مادة دراسية بنفس الرمز في هذا المعهد',
    subject_mismatch: 'المادة الدراسية لا تتبع لهذا المعهد',
    subject_has_sections: 'لا يمكن حذف المادة الدراسية لتعيينها لشُعب دراسية',
    section_subject_already_exists: 'المادة الدراسية معينة بالفعل لهذه الشُعبة',
    section_subject_not_found: 'المادة الدراسية غير معينة لهذه الشُعبة',
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
