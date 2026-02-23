import { create } from 'zustand';
import type { Expedicion, Participacion } from '../types/expedition';
import type { HabitacionLayout, EncounterResponse, ProcesarRecompensasResponse } from '../types/gameplay';

export type SetupStep = 'select_pisos' | 'configure_floor' | 'rooms_preview' | 'add_participants' | 'ready';

export type GamePhase =
  | 'setup'
  | 'playing'
  | 'floor_complete'
  | 'expedition_complete';

export interface FloorConfig {
  piso: number;
  numSalas: number;
  includeBonus: boolean;
  includeEvento: boolean;
}

export interface RoomState {
  habitacion: HabitacionLayout;
  encounterResult: EncounterResponse | null;
  rewardsResult: ProcesarRecompensasResponse | null;
  encounterResolved: boolean;
  rewardsResolved: boolean;
  itemsAssigned: boolean;
  goldDistributed: boolean;
  completed: boolean;
}

interface ExpeditionState {
  activeExpedition: Expedicion | null;
  participants: Participacion[];

  // Setup
  setupStep: SetupStep;
  selectedPisos: number[];
  floorConfigs: FloorConfig[];
  currentConfigIndex: number;

  // Playing
  phase: GamePhase;
  currentFloorIndex: number;
  rooms: RoomState[];
  expandedRoomIndex: number | null;

  // Actions - setup
  setActiveExpedition: (exp: Expedicion) => void;
  setParticipants: (parts: Participacion[]) => void;
  setSetupStep: (step: SetupStep) => void;
  setSelectedPisos: (pisos: number[]) => void;
  setFloorConfigs: (configs: FloorConfig[]) => void;
  setCurrentConfigIndex: (index: number) => void;

  // Actions - playing
  setPhase: (phase: GamePhase) => void;
  setCurrentFloorIndex: (index: number) => void;
  setRooms: (rooms: RoomState[]) => void;
  setExpandedRoom: (index: number | null) => void;
  updateRoom: (index: number, updates: Partial<RoomState>) => void;
  nextFloor: () => boolean;

  reset: () => void;
}

export const useExpeditionStore = create<ExpeditionState>((set, get) => ({
  activeExpedition: null,
  participants: [],

  setupStep: 'select_pisos',
  selectedPisos: [],
  floorConfigs: [],
  currentConfigIndex: 0,

  phase: 'setup',
  currentFloorIndex: 0,
  rooms: [],
  expandedRoomIndex: null,

  setActiveExpedition: (exp) => set({ activeExpedition: exp }),
  setParticipants: (parts) => set({ participants: parts }),
  setSetupStep: (step) => set({ setupStep: step }),
  setSelectedPisos: (pisos) => set({ selectedPisos: pisos }),
  setFloorConfigs: (configs) => set({ floorConfigs: configs }),
  setCurrentConfigIndex: (index) => set({ currentConfigIndex: index }),

  setPhase: (phase) => set({ phase }),
  setCurrentFloorIndex: (index) => set({ currentFloorIndex: index }),
  setRooms: (rooms) => set({ rooms }),
  setExpandedRoom: (index) => set({ expandedRoomIndex: index }),
  updateRoom: (index, updates) => {
    const rooms = [...get().rooms];
    if (rooms[index]) {
      rooms[index] = { ...rooms[index], ...updates };
      set({ rooms });
    }
  },
  nextFloor: () => {
    const { currentFloorIndex, floorConfigs } = get();
    if (currentFloorIndex < floorConfigs.length - 1) {
      set({
        currentFloorIndex: currentFloorIndex + 1,
        rooms: [],
        expandedRoomIndex: null,
      });
      return true;
    }
    set({ phase: 'expedition_complete' });
    return false;
  },

  reset: () =>
    set({
      activeExpedition: null,
      participants: [],
      setupStep: 'select_pisos',
      selectedPisos: [],
      floorConfigs: [],
      currentConfigIndex: 0,
      phase: 'setup',
      currentFloorIndex: 0,
      rooms: [],
      expandedRoomIndex: null,
    }),
}));
