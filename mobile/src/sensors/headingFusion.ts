import type { SensorSnapshot } from '../types';

export type HeadingInput = {
  compassHeading: number | null;
  compassAccuracy: number;
  gpsHeading: number | null;
  speedKmh: number;
  previousHeading: number | null;
};

const normalize = (value: number) => ((value % 360) + 360) % 360;
const angleDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;
const blend = (from: number, to: number, weight: number) => normalize(from + angleDelta(from, to) * weight);

export function fuseHeading(input: HeadingInput): Pick<SensorSnapshot, 'displayHeading' | 'headingSource' | 'confidence'> {
  const compass = input.compassHeading === null ? null : normalize(input.compassHeading);
  const course = input.gpsHeading === null ? null : normalize(input.gpsHeading);
  const previous = input.previousHeading === null ? null : normalize(input.previousHeading);
  const speed = Math.max(0, input.speedKmh);
  const compassConfidence = Math.max(0, Math.min(1, input.compassAccuracy / 3));

  let target = previous ?? 0;
  let source: SensorSnapshot['headingSource'] = 'unknown';
  let confidence = 0;

  if (speed >= 12 && course !== null) {
    target = course;
    source = 'gps';
    confidence = 92;
  } else if (speed >= 5 && course !== null && compass !== null) {
    target = blend(compass, course, compassConfidence >= 0.66 ? 0.62 : 0.78);
    source = 'fused';
    confidence = Math.round(Math.min(90, 62 + speed));
  } else if (compass !== null) {
    target = compass;
    source = 'compass';
    confidence = Math.round(30 + compassConfidence * 55);
  } else if (course !== null) {
    target = course;
    source = 'gps';
    confidence = speed >= 3 ? 58 : 32;
  }

  if (previous !== null) {
    const turn = Math.abs(angleDelta(previous, target));
    const smoothing = speed >= 15 ? 0.48 : speed >= 5 ? 0.34 : 0.22;
    target = blend(previous, target, turn > 70 ? smoothing * 0.65 : smoothing);
  }

  return { displayHeading: normalize(target), headingSource: source, confidence };
}
