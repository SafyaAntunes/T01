import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TipoServico } from '@/types/ordens';
import { useAtribuirFuncionariosDialog } from "./hooks/useAtribuirFuncionariosDialog";
import { FuncionarioCheckItem } from "./components/FuncionarioCheckItem";
import { useCallback, useEffect, useMemo, useState } from "react";

interface AtribuirMultiplosFuncionariosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (funcionariosIds: string[], funcionariosNomes: string[]) => void;
  funcionariosSelecionadosIds?: string[];
  especialidadeRequerida?: TipoServico;
  title?: string;
  description?: string;
  apenasDisponiveis?: boolean;
  confirmLabel?: string;
}

export function AtribuirMultiplosFuncionariosDialog({
  open,
  onOpenChange,
  onConfirm,
  funcionariosSelecionadosIds = [],
  especialidadeRequerida,
  title = "Atribuir Funcionários",
  description = "Selecione os funcionários para realizar este serviço.",
  apenasDisponiveis = true,
  confirmLabel = "Confirmar"
}: AtribuirMultiplosFuncionariosDialogProps) {
  const {
    funcionariosFiltradosAtual,
    loading,
    funcionariosSelecionados,
    handleToggleFuncionario,
    isFuncionarioSelected,
    handleConfirm
  } = useAtribuirFuncionariosDialog({
    funcionariosSelecionadosIds,
    especialidadeRequerida,
    apenasDisponiveis,
    onConfirm
  });

  // Handler para confirmar a seleção
  const handleConfirmSelection = useCallback(() => {
    if (handleConfirm(onConfirm)) {
      onOpenChange(false);
    }
  }, [handleConfirm, onConfirm, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : funcionariosFiltradosAtual.length > 0 ? (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {funcionariosFiltradosAtual.map((funcionario) => (
                  <FuncionarioCheckItem
                    key={funcionario.id}
                    id={funcionario.id}
                    nome={funcionario.nome}
                    status={funcionario.status}
                    especialidades={funcionario.especialidades}
                    isChecked={isFuncionarioSelected(funcionario.id)}
                    onToggle={handleToggleFuncionario}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum funcionário disponível
              {especialidadeRequerida && (
                <> com especialidade em {especialidadeRequerida}</>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmSelection}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
