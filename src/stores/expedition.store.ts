import { create } from 'zustand';
import type { Expedicion, Participacion } from '../types/expedition';
import type { HabitacionLayout, EncounterResponse, ProcesarRecompensasResponse } from '../types/gameplay';

export type GamePhase =
  | 'setup'
  | 'floor_select'
  | 'room_list'
  | 'encounter'
  | 'rewards'
  | 'assign_items'
  | 'distribute_gold'
  | 'room_complete';

interface ExpeditionState {
  activeExpedition: Expedicion | null;
  participants: Participacion[];
  currentFloor: number | null;
  habitaciones: HabitacionLayout[];
  currentHabitacionIndex: number;
  phase: GamePhase;

  encounterResult: EncounterResponse | null;
  rewardsResult: ProcesarRecompensasResponse | null;

  setActiveExpedition: (exp: Expedicion) => void;
  setParticipants: (parts: Participacion[]) => void;
  setFloor: (floor: number, habitaciones: HabitacionLayout[]) => void;
  setPhase: (phase: GamePhase) => void;
  setCurrentHabitacionIndex: (index: number) => void;
  setEncounterResult: (result: EncounterResponse | null) => void;
  setRewardsResult: (result: ProcesarRecompensasResponse | null) => void;
  markHabitacionCompleted: (index: number) => void;
  nextHabitacion: () => void;
  reset: () => void;
}

export const useExpeditionStore = create<ExpeditionState>((set, get) => ({
  activeExpedition: null,
  participants: [],
  currentFloor: null,
  habitaciones: [],
  currentHabitacionIndex: 0,
  phase: 'setup',
  encounterResult: null,
  rewardsResult: null,

  setActiveExpedition: (exp) => set({ activeExpedition: exp }),
  setParticipants: (parts) => set({ participants: parts }),
  setFloor: (floor, habitaciones) =>
    set({ currentFloor: floor, habitaciones, currentHabitacionIndex: 0, phase: 'room_list' }),
  setPhase: (phase) => set({ phase }),
  setCurrentHabitacionIndex: (index) => set({ currentHabitacionIndex: index }),
  setEncounterResult: (result) => set({ encounterResult: result }),
  setRewardsResult: (result) => set({ rewardsResult: result }),
  markHabitacionCompleted: (index) => {
    const habitaciones = [...get().habitaciones];
    if (habitaciones[index]) {
      habitaciones[index] = { ...habitaciones[index], completada: true };
      set({ habitaciones });
    }
  },
  nextHabitacion: () => {
    const { currentHabitacionIndex, habitaciones } = get();
    const nextIndex = habitaciones.findIndex(
      (h, i) => i > currentHabitacionIndex && !h.completada
    );
    if (nextIndex >= 0) {
      set({ currentHabitacionIndex: nextIndex, phase: 'room_list', encounterResult: null, rewardsResult: null });
    }
  },
  reset: () =>
    set({
      activeExpedition: null,
      participants: [],
      currentFloor: null,
      habitaciones: [],
      currentHabitacionIndex: 0,
      phase: 'setup',
      encounterResult: null,
      rewardsResult: null,
    }),
}));
