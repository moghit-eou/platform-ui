// Interface for a Variable in the data model
export interface Variable {
  label: string;
  code?: string;
  description?: string;
  sql_type?: string;
  isCategorical?: boolean;
  enumerations?: EnumValue[];
  type?: string;
  methodology?: string;
  units?: string;
  minValue?: number;
  maxValue?: number;
}

interface EnumValue {
  label: string;  // UI label
  code: any;    //  backend value
}

// Interface for a Group in the data model
export interface Group {
  label: string;
  code?: string;
  variables?: Variable[];
  groups?: Group[];
}

// Interface for the overall DataModel
export interface DataModel {
  uuid: string;
  label: string;
  code?: string;
  version?: string;  // Root level only
  longitudinal?: boolean;  // Root level only
  variables?: Variable[];
  groups?: Group[];
  released:boolean;
  datasets?: string[];
}

// D3 hierarchy format interface
export interface D3HierarchyNode {
  // name: string;
  label: string;
  value?: number;  // Optional, as this may only be used for leaf nodes
  code?: string;
  description?: string;
  sql_type?: string;
  isCategorical?: boolean;
  enumerations?: any[];
  type?: string;
  methodology?: string;
  units?: string;
  minValue?: number;
  maxValue?: number;
  children?: D3HierarchyNode[];  // Recursive children
}
