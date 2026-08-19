#!/usr/bin/env node

import { Command } from 'commander';
import { SemgrepScanner } from './scanner/semgrep';
import { OllamaValidator } from './ai/ollama';
import { ASTAnalyzer } from './analyzer/ast';
import { EntropyAnalyzer } from './analyzer/entropy';
import { SarifGenerator } from './scanner/sarif';
import { Patcher } from './scanner/patcher';
import { GitHelper } from './scanner/git';
import { SCAScanner } from './scanner/sca';
import { ConfigLoader } from './config/loader';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import * as inquirer from 'inquirer';

const program = new Command();

function getFileSnippet(filePath: string, startLine: number, endLine: number): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const contextStart = Math.max(0, startLine - 4);
    const contextEnd = Math.min(lines.length, endLine + 3);
    return lines.slice(contextStart, contextEnd).join('\n');
  } catch (e) {
    return '// Snippet indisponível';
  }
}

program
  .name('cypherguard')
  .description('CypherGuard AI - Ferramenta SAST local com mitigação de falsos positivos via LLM.')
  .version('1.0.0');

program
  .command('scan')
  .description('Executa a varredura SAST em um diretório ou arquivo.')
  .argument('<path>', 'Caminho para o diretório ou arquivo a ser analisado')
  .option('--sarif', 'Gera um relatório na raiz do diretório no formato cypherguard-report.sarif')
  .option('--apply', 'Aplica automaticamente as correções sugeridas pela IA após revisão de diff (requer git limpo; gera backup .bak)')
  .action(async (targetPath: string, options: any) => {
    const fullPath = path.resolve(targetPath);
    
    if (!fs.existsSync(fullPath)) {
      console.error(chalk.red(`Erro: O caminho '${fullPath}' não existe.`));
      process.exit(1);
    }

    console.log(chalk.cyan.bold(`\n🛡️  CypherGuard AI Iniciado`));
    console.log(chalk.gray(`Alvo: ${fullPath}\n`));
    
    // Integração Git
    if (GitHelper.isGitRepo()) {
      const branch = GitHelper.getCurrentBranch();
      console.log(chalk.blue(`[Git] Repositório detectado na branch: ${branch}`));
      if (GitHelper.isDirty()) {
        console.log(chalk.yellow(`[Git] ⚠️  Aviso: Você tem alterações não commitadas. Recomenda-se um estado limpo antes de aplicar patches.\n`));
      }
    } else {
      console.log(chalk.gray(`[Git] Projeto não está sob controle de versão Git.\n`));
    }

    if (options.apply) {
      try {
        GitHelper.assertCleanForApply();
      } catch (e: any) {
        console.error(chalk.red(`Erro: ${e.message}`));
        process.exit(1);
      }
    }

    const spinner = ora('Executando Semgrep (Camada 1 - Heurística)...').start();

    try {
      const scanner = new SemgrepScanner();
      const config = ConfigLoader.loadConfig();
      const results = await scanner.scan(fullPath);

      if (scanner.hasScanErrors(results)) {
        console.log(
          chalk.yellow(`[Semgrep] ⚠️  ${results.errors.length} erro(s) durante a varredura (regras/parse). Resultado pode estar incompleto.`)
        );
      }

      const findingsCount = results.results.length;
      const sarifGen = new SarifGenerator();

      if (findingsCount === 0) {
        spinner.succeed(chalk.green('Nenhuma vulnerabilidade detectada pela heurística (Camada 1).'));
      } else {
        spinner.warn(chalk.yellow(`Varredura concluída. ${findingsCount} vulnerabilidades suspeitas encontradas.`));

        console.log(chalk.cyan(`\nIniciando Camadas 2 (AST) e 3 (IA LLM) para ${findingsCount} alertas...`));

        const ollama = new OllamaValidator();
        const ast = new ASTAnalyzer();

        for (let i = 0; i < findingsCount; i++) {
          const finding = results.results[i];
          console.log(chalk.whiteBright.bold(`\n--- Alerta ${i + 1}/${findingsCount} ---`));
          console.log(chalk.gray(`Arquivo: `) + finding.path + chalk.gray(` (Linha ${finding.start.line})`));
          console.log(chalk.gray(`Regra:   `) + chalk.magenta(finding.check_id));

          const snippet = getFileSnippet(finding.path, finding.start.line, finding.end.line);
          const entropyThreshold = config.entropy.threshold;

          // Fase 2: Taint Analysis e Entropia
          let suspiciousLiterals: string[] = [];
          if (finding.check_id.toLowerCase().includes('hardcoded') || finding.check_id.toLowerCase().includes('secret')) {
            suspiciousLiterals = EntropyAnalyzer.findSuspiciousStrings(snippet, entropyThreshold);
            if (suspiciousLiterals.length > 0) {
              console.log(chalk.yellow(`[AST/Entropia] Alta entropia detectada (threshold ${entropyThreshold}): ${suspiciousLiterals.join(', ')}`));
            } else {
              console.log(chalk.green(`[AST/Entropia] Nenhum literal com entropia alta. Provável mock.`));
            }
          } else {
            // AST Verification
            const suspiciousFlow = ast.isFlowSuspicious(snippet);
            if (!suspiciousFlow) {
              console.log(chalk.green(`[AST] Fluxo de dado sanitizado identificado! Risco mitigado.`));
            }
          }

          // Fase 3: Validação LLM
          const aiSpinner = ora('Solicitando auditoria ao Llama 3 local...').start();
          const enrichedContext = suspiciousLiterals.length > 0
            ? `${finding.extra.message}\n[Entropia] Strings de alta entropia no trecho: ${suspiciousLiterals.join(', ')}`
            : finding.extra.message;
          const aiResult = await ollama.validateAlert(snippet, finding.check_id, enrichedContext);
          aiSpinner.stop();

          if (aiResult.status === 'True Positive') {
            console.log(chalk.red.bold(`[IA] 🔴 Verdadeiro Positivo`));
            console.log(chalk.red(`  Gravidade: ${aiResult.gravidade}`));
            console.log(chalk.white(`  Motivo:    ${aiResult.explicacao}`));
            if (aiResult.correcao) console.log(chalk.green(`  Correção Sugerida:  ${aiResult.correcao}`));

            if (options.apply && aiResult.correcao) {
              const preview = Patcher.preview(finding.path, finding.start.line, finding.end.line, aiResult.correcao);
              if (preview) {
                console.log(chalk.gray(`\n  [PREVIEW] Diff em ${path.basename(finding.path)} (linha ${finding.start.line}):`));
                const beforeLines = preview.before.split('\n').map((l) => `  - ${l}`).join('\n');
                const afterLines = preview.after.split('\n').map((l) => `  + ${l}`).join('\n');
                console.log(chalk.red(beforeLines));
                console.log(chalk.green(afterLines));
              }

              const { confirm } = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'confirm',
                  message: `Deseja aplicar a correção sugerida no arquivo ${path.basename(finding.path)} (linha ${finding.start.line})?`,
                  default: false
                }
              ]);

              if (confirm) {
                const success = Patcher.applyPatch(finding.path, finding.start.line, finding.end.line, aiResult.correcao);
                if (success) {
                  console.log(chalk.green.bold(`  [AUTO-PATCH] ✅ Correção aplicada com sucesso.`));
                }
              } else {
                console.log(chalk.gray(`  [AUTO-PATCH] ⏭️  Correção ignorada pelo usuário.`));
              }
            }

            if (options.sarif) {
              sarifGen.addResult(finding, aiResult);
            }
          } else if (aiResult.status === 'False Positive') {
            console.log(chalk.green.bold(`[IA] 🟢 Falso Positivo`));
            console.log(chalk.gray(`  Motivo:    ${aiResult.explicacao}`));
          } else {
            console.log(chalk.yellow.bold(`[IA] 🟡 Desconhecido`));
            console.log(chalk.gray(`  Detalhe:   ${aiResult.explicacao}`));
          }
        }

        if (options.sarif) {
          const sarifPath = path.join(process.cwd(), 'cypherguard-report.sarif');
          sarifGen.save(sarifPath);
          console.log(chalk.blue(`\n[+] Relatório SARIF gerado em: ${sarifPath}`));
        }
      }

      // Camada 4 — SCA: roda sempre, inclusive quando não há achados SAST.
      console.log(chalk.cyan(`\nExecutando Camada 4 (SCA) — auditoria de dependências...`));
      const scaScanner = new SCAScanner();
      const scaOutcome = await scaScanner.scan(fullPath);

      if (scaOutcome.status === 'error') {
        console.log(
          chalk.yellow(
            `[SCA] ⚠️  Não foi possível concluir a auditoria de dependências (falha de rede ou API OSV). Resultado pode estar incompleto.`
          )
        );
      } else if (scaOutcome.results.length === 0) {
        console.log(chalk.green(`[SCA] ✅ Nenhuma dependência vulnerável encontrada.`));
      } else {
        console.log(chalk.red.bold(`[SCA] 🔴 ${scaOutcome.results.length} vulnerabilidade(s) de dependência encontrada(s):`));
        scaOutcome.results.forEach((vuln) => {
          console.log(chalk.red(`  ${vuln.package}@${vuln.version} — ${vuln.vulnerabilityId} (${vuln.severity})`));
          console.log(chalk.gray(`    ${vuln.summary}`));
        });
      }

      console.log(chalk.green.bold(`\n✅ Auditoria concluída com sucesso.\n`));
    } catch (error: any) {
      spinner.fail(chalk.red(`Falha na varredura: ${error.message}`));
      process.exit(1);
    }
  });

program.parse();
