import { z } from 'zod';
import type { ClearanceBusinessType, SubscriptionPlan } from '@/types';

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => value || undefined);

export const registrationSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(120),
    email: z.email('Enter a valid email address').transform((value) => value.toLowerCase()),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    businessType: z.enum([
      'customs_broker',
      'importer_exporter',
      'freight_forwarder',
      'individual',
    ]),
    companyName: optionalText(160),
    companyNameAr: optionalText(160),
    crNumber: optionalText(30),
    vatNumber: optionalText(30),
    brokerLicenseNo: optionalText(60),
    fasahId: optionalText(60),
    primaryPort: optionalText(100),
    industrySector: optionalText(100),
    transportLicenseNo: optionalText(60),
    monthlyVolume: optionalText(60),
    phone: optionalText(30),
  })
  .superRefine((data, context) => {
    if (data.businessType === 'individual') return;

    if (!data.companyName) {
      context.addIssue({
        code: 'custom',
        path: ['companyName'],
        message: 'Company name is required for business accounts',
      });
    }

    if (!data.crNumber) {
      context.addIssue({
        code: 'custom',
        path: ['crNumber'],
        message: 'Commercial registration number is required for business accounts',
      });
    }
  });

export type RegistrationInput = z.infer<typeof registrationSchema>;

export function getRegistrationPlan(businessType: ClearanceBusinessType): SubscriptionPlan {
  if (businessType === 'customs_broker' || businessType === 'freight_forwarder') {
    return 'enterprise';
  }

  if (businessType === 'importer_exporter') return 'pro';
  return 'free';
}
