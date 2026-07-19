import type { CameraMode, SensorSnapshot } from '../types';

export type NavigationState = {
  cameraMode: CameraMode;
  sensor: SensorSnapshot | null;
  selectedParkingId: string | null;
  routeActive: boolean;
};

export const initialNavigationState: NavigationState = {
  cameraMode: 'explore',
  sensor: null,
  selectedParkingId: null,
  routeActive: false,
};

export type NavigationAction =
  | { type: 'SENSOR_UPDATE'; sensor: SensorSnapshot }
  | { type: 'SET_CAMERA_MODE'; mode: CameraMode }
  | { type: 'SELECT_PARKING'; parkingId: string | null }
  | { type: 'SET_ROUTE_ACTIVE'; active: boolean };

export function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case 'SENSOR_UPDATE':
      return { ...state, sensor: action.sensor };
    case 'SET_CAMERA_MODE':
      return { ...state, cameraMode: action.mode };
    case 'SELECT_PARKING':
      return { ...state, selectedParkingId: action.parkingId };
    case 'SET_ROUTE_ACTIVE':
      return { ...state, routeActive: action.active };
    default:
      return state;
  }
}
