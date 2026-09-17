import { RawInputData, RawPreprocessingStep } from "./backend-algorithms.model";


export type AlgorithmAvailabilityRole = 'y' | 'x';

export interface AlgorithmAvailabilityDetail {
  role: AlgorithmAvailabilityRole;
  label: string;
  selectedCount: number;
  minCount: number;
  maxCount: number | null;
  required: boolean;
  types: string[];
  stattypes: string[];
  messages: string[];
  satisfied: boolean;
}

export interface AlgorithmAvailability {
  available: boolean;
  summary: string | null;
  details: AlgorithmAvailabilityDetail[];
}

export interface AlgorithmConfig {
  name: string;
  label: string;
  description: string;
  documentation?: string;
  type?: string;
  flags?: string[];
  requiredVariable: string[];
  covariate: string[];
  category: string;
  configSchema: Array<any>;
  inputdata?: RawInputData;
  preprocessing?: RawPreprocessingStep[];
  requires_validation_datasets?: boolean;
  required_preprocessing?: string[];
  isDisabled: boolean;
  availability?: AlgorithmAvailability;
}
