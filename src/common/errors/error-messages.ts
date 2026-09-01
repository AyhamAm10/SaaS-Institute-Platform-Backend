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
