import { BackendFilter } from './filters.model';

interface RawIOField {
  label: string;
  desc: string;
  types: string[];
  stattypes?: string[];
  required?: boolean | string;
  min_count?: number | string;
  max_count?: number | string;
}

export interface RawParameter {
  label: string;
  desc: string;
  types: string[];
  stattypes?: number;
  required?: boolean | string;
  multiple?: boolean | string;
  default_value?: string | number | boolean;
  min?: string | number;
  max?: string | number;
  default?: string | number | boolean;
  enums?: RawEnumsDefinition;
  dict_keys_enums?: RawEnumsDefinition;
  dict_values_enums?: RawEnumsDefinition;
  dict_values_type?: 'real' | 'int' | 'text' | 'boolean';
}

interface RawEnumsDefinition {
  type: 'list' | 'input_var_names' | 'input_var_CDE_enums' | 'fixed_var_CDE_enums' | 'variables';
  source: string[] | string;
}

interface RawDictParameter extends RawParameter {
  dict_keys_enums?: RawEnumsDefinition;
  dict_values_enums?: RawEnumsDefinition;
}

/** Shared inputdata specification from GET /services/specifications/inputdata */
export interface AnalysisInputDataSpecification {
  data_model: RawIOField;
  datasets: RawIOField;
  filters: RawIOField;
  variables: RawIOField;
  validation_datasets?: RawIOField;
}

/** Preprocessing step specification from GET /services/specifications/preprocessing */
export interface PreprocessingStepSpecification {
  name: string;
  label: string;
  desc: string;
  documentation?: string;
  order?: number;
  parameters: Record<string, RawParameter | RawDictParameter> | null;
  output?: {
    type: string;
    code_parameter?: string;
  } | null;
}

/** Algorithm specification from GET /services/specifications/algorithms */
export interface AlgorithmSpecification {
  name: string;
  label: string;
  desc: string;
  documentation?: string;
  type?: string;
  flags?: string[];
  y: RawIOField;
  x?: RawIOField | null;
  requires_validation_datasets: boolean;
  parameters: Record<string, RawParameter> | null;
  required_preprocessing: string[];
}

/** Merged inputdata view used by AlgorithmConfig (shared slots + algorithm y/x). */
export interface RawInputData {
  data_model?: RawIOField;
  datasets?: RawIOField;
  filters?: RawIOField;
  filter?: RawIOField;
  variables?: RawIOField;
  validation_datasets?: RawIOField;
  y?: RawIOField;
  x?: RawIOField;
}

export interface RawPreprocessingStep {
  name: string;
  label: string;
  desc: string;
  documentation?: string;
  order?: number;
  parameters: Record<string, RawParameter | RawDictParameter>;
  output?: {
    type: string;
    code_parameter?: string;
  } | null;
}


export interface AnalysisInputData {
  data_model: string;
  datasets: string[];
  validation_datasets?: string[] | null;
  filters?: BackendFilter | null;
  variables: string[];
}

export interface AnalysisPreprocessingStep {
  name: string;
  parameters: Record<string, unknown>;
}

interface AnalysisAlgorithm {
  name: string;
  x?: string[] | null;
  y?: string[] | null;
  parameters?: Record<string, unknown>;
}

export interface AnalysisRequest {
  request_id?: string | null;
  inputdata: AnalysisInputData;
  preprocessing?: AnalysisPreprocessingStep[] | null;
  algorithm: AnalysisAlgorithm;
  flags?: Record<string, unknown> | null;
}

export interface ExperimentCreateRequest {
  name: string;
  analysis: AnalysisRequest;
}
