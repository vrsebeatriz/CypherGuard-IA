export interface SemgrepMatch {
  check_id: string;
  path: string;
  start: { line: number; col: number; offset: number };
  end: { line: number; col: number; offset: number };
  extra: {
    message: string;
    metadata: any;
    severity: string;
    lines: string;
  };
}

export interface SemgrepResult {
  errors: any[];
  results: SemgrepMatch[];
  paths: { scanned: string[] };
}

export interface VulnerabilityAlert {
  id: string;
  file: string;
  line: number;
  snippet: string;
  vulnerability: string;
  severity: string;
  aiValidation?: AIValidationResult;
}

export interface AIValidationResult {
  status: 'True Positive' | 'False Positive' | 'Unknown';
  gravidade: 'Alta' | 'Media' | 'Baixa' | 'Nenhuma';
  explicacao: string;
  correcao?: string;
}

export interface CypherConfig {
  ollama: {
    model: string;
    temperature: number;
    baseUrl: string;
  };
  entropy: {
    threshold: number;
  };
  rules: {
    customPrompts?: Record<string, string>;
  };
}
