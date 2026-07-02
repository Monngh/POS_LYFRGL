import React from 'react';

export interface PosStepperProps {
  steps: string[];
  currentStep: number; // 0-indexed
}

export function PosStepper({ steps, currentStep }: PosStepperProps) {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '16px 0',
    marginBottom: '24px'
  };

  const stepWrapper: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
  };

  const lineStyle = (isActive: boolean): React.CSSProperties => ({
    height: '2px',
    width: '80px',
    backgroundColor: isActive ? '#2563eb' : 'var(--border)', // Blue for active/completed
    margin: '0 12px',
    transition: 'background-color 0.3s',
  });

  const circleStyle = (isActive: boolean, isCompleted: boolean): React.CSSProperties => ({
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '700',
    backgroundColor: isActive || isCompleted ? '#2563eb' : 'transparent',
    color: isActive || isCompleted ? '#ffffff' : 'var(--text-muted)',
    border: `2px solid ${isActive || isCompleted ? '#2563eb' : 'var(--border)'}`,
    transition: 'all 0.3s',
  });

  const labelStyle = (isActive: boolean): React.CSSProperties => ({
    fontSize: '12px',
    fontWeight: isActive ? '700' : '500',
    color: isActive ? '#2563eb' : 'var(--text-secondary)',
    marginTop: '8px',
    position: 'absolute',
    top: '32px',
    whiteSpace: 'nowrap',
    transition: 'color 0.3s',
  });

  return (
    <div style={containerStyle}>
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div key={step} style={stepWrapper}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div style={circleStyle(isActive, isCompleted)}>
                {index + 1}
              </div>
              <span style={labelStyle(isActive)}>{step}</span>
            </div>
            {index < steps.length - 1 && (
              <div style={lineStyle(isCompleted)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
