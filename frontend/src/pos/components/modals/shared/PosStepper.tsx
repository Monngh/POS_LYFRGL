import React from 'react';

export interface PosStepperProps {
  steps: string[];
  currentStep: number; // 0-indexed
}

export function PosStepper({ steps, currentStep }: PosStepperProps) {
  return (
    <div className="pos-stepper-container">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div key={step} className="pos-stepper-wrapper">
            <div className="pos-stepper-circle-container">
              <div className={`pos-stepper-circle ${isActive || isCompleted ? 'active' : ''} ${isActive ? 'current' : ''}`}>
                {index + 1}
              </div>
              <span className={`pos-stepper-label ${isActive ? 'active' : ''}`}>{step}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`pos-stepper-line ${isCompleted ? 'active' : ''}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

