export type BackendRule = {
  id: string;
  field: string;
  type: 'string' | 'integer' | 'real';   // backend works with "string", not "nominal"
  input: 'text' | 'number' | 'select';
  operator: string;
  value: any;
};

type BackendFilterNode = BackendRule | BackendFilter;

export type BackendFilter = {
  condition: 'AND' | 'OR';
  rules: BackendFilterNode[];
  valid?: boolean;
};
