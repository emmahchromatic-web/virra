import { defineType, defineField } from 'sanity';

const PHASES = ['Menstrual', 'Follicular', 'Ovulatory', 'Luteal'] as const;

export const cycleCalculatorCopy = defineType({
  name: 'cycleCalculatorCopy',
  title: 'Cycle Calculator Copy',
  type: 'document',
  fields: PHASES.map((phase) =>
    defineField({
      name: phase.toLowerCase(),
      title: phase,
      type: 'object',
      fields: [
        {
          name: 'guidance',
          type: 'string',
          title: 'Pace guidance',
          description: 'e.g. "Reduce pace by 10–15% — energy is lower, but consistency matters."',
        },
        {
          name: 'why',
          type: 'string',
          title: 'Why (one sentence)',
          description: 'Brief physiological reason. Non-clinical.',
        },
      ],
    })
  ),
  preview: { prepare: () => ({ title: 'Cycle Calculator Copy' }) },
});
