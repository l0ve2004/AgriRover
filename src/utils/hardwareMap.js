/**
 * Hardware Motor Wiring Translation Map for AgriRover
 *
 * Physical motor wiring configuration:
 * - Forward button -> sends 'right' (actuates both motors forward on current hardware wiring)
 * - Reverse button -> sends 'left' (actuates both motors in reverse on current hardware wiring)
 * - Left button    -> sends 'backward' (pivots rover left on current hardware wiring)
 * - Right button   -> sends 'forward' (pivots rover right on current hardware wiring)
 * - Stop button    -> sends 'stop' (brakes all motors)
 */

export const HARDWARE_MOTOR_MAP = {
  forward: 'right',
  backward: 'left',
  left: 'backward',
  right: 'forward',
  stop: 'stop'
};

export const translateMotorCommand = (direction) => {
  if (!direction || typeof direction !== 'string') return direction;
  const normalized = direction.toLowerCase();
  return HARDWARE_MOTOR_MAP[normalized] || direction;
};

