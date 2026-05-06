import React from 'react';
import { render } from '@testing-library/react-native';
import { OnboardingProgressBar } from '@/components/ui/OnboardingProgressBar';

describe('OnboardingProgressBar', () => {
  it('renders 7 pill segments', () => {
    const { getAllByTestId } = render(<OnboardingProgressBar currentStep={1} totalSteps={7} />);
    expect(getAllByTestId('progress-pill')).toHaveLength(7);
  });

  it('fills pills 1 through currentStep in lime', () => {
    const { getAllByTestId } = render(<OnboardingProgressBar currentStep={3} totalSteps={7} />);
    const pills = getAllByTestId('progress-pill');
    expect(pills[0].props.style).toMatchObject({ backgroundColor: '#D4FF26' });
    expect(pills[1].props.style).toMatchObject({ backgroundColor: '#D4FF26' });
    expect(pills[2].props.style).toMatchObject({ backgroundColor: '#D4FF26' });
    expect(pills[3].props.style).toMatchObject({ backgroundColor: 'rgba(212,255,38,0.15)' });
  });

  it('fills all 7 pills at step 7', () => {
    const { getAllByTestId } = render(<OnboardingProgressBar currentStep={7} totalSteps={7} />);
    getAllByTestId('progress-pill').forEach(pill =>
      expect(pill.props.style).toMatchObject({ backgroundColor: '#D4FF26' })
    );
  });
});
