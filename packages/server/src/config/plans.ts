/** Plan definitions — simple config object, no DB needed until 20+ customers */
export const PLANS = {
  trial: {
    label: '体验版',
    maxInterviewsPerMonth: 3,
    maxSeats: 1,
    trialDays: 30,
  },
  pro: {
    label: '专业版',
    maxInterviewsPerMonth: 50,
    maxSeats: 5,
    trialDays: -1, // unlimited
  },
  enterprise: {
    label: '企业版',
    maxInterviewsPerMonth: 999,
    maxSeats: 50,
    trialDays: -1,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlan(planId: string) {
  return PLANS[planId as PlanId] || PLANS.trial;
}
