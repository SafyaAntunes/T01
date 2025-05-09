import { useState, useEffect, useCallback } from 'react';
import { useFuncionariosDisponibilidade } from '@/hooks/useFuncionariosDisponibilidade';
import { TipoServico } from '@/types/ordens';
import { toast } from "sonner";

interface UseAtribuirFuncionariosDialogProps {
  funcionariosSelecionadosIds?: string[];
  especialidadeRequerida?: TipoServico;
  apenasDisponiveis?: boolean;
  onConfirm?: (ids: string[], nomes: string[]) => void;
}

export function useAtribuirFuncionariosDialog({
  funcionariosSelecionadosIds = [],
  especialidadeRequerida,
  apenasDisponiveis = true,
  onConfirm
}: UseAtribuirFuncionariosDialogProps) {
  const { funcionariosStatus, funcionariosDisponiveis, loading } = useFuncionariosDisponibilidade();
  const [funcionariosSelecionados, setFuncionariosSelecionados] = useState<string[]>(funcionariosSelecionadosIds);

  // Sincronizar com os IDs passados como props
  useEffect(() => {
    setFuncionariosSelecionados(funcionariosSelecionadosIds);
  }, [funcionariosSelecionadosIds]);

  // Filtrar funcionários com base nas condições
  const funcionariosFiltradosAtual = funcionariosStatus.filter(funcionario => {
    if (especialidadeRequerida && !funcionario.especialidades?.includes(especialidadeRequerida)) {
      return false;
    }
    if (apenasDisponiveis && funcionario.status !== 'disponivel') {
      return false;
    }
    return true;
  });

  const handleToggleFuncionario = useCallback((id: string) => {
    setFuncionariosSelecionados(prev => {
      const isSelected = prev.includes(id);
      return isSelected 
        ? prev.filter(fid => fid !== id)
        : [...prev, id];
    });
  }, []);

  const isFuncionarioSelected = useCallback((id: string) => {
    return funcionariosSelecionados.includes(id);
  }, [funcionariosSelecionados]);

  const handleConfirm = useCallback((dialogOnConfirm?: (ids: string[], nomes: string[]) => void) => {
    const onConfirmFn = dialogOnConfirm || onConfirm;

    if (!onConfirmFn) {
      console.error("Função onConfirm não fornecida");
      return false;
    }

    if (funcionariosSelecionados.length === 0) {
      toast.error("Selecione pelo menos um funcionário para continuar");
      return false;
    }

    const funcionariosSelecionadosNomes = funcionariosSelecionados.map(id => {
      const funcionario = funcionariosStatus.find(f => f.id === id);
      return funcionario?.nome || id;
    });

    onConfirmFn(funcionariosSelecionados, funcionariosSelecionadosNomes);
    return true;
  }, [funcionariosSelecionados, funcionariosStatus, onConfirm]);

  return {
    funcionariosFiltradosAtual,
    loading,
    funcionariosSelecionados,
    handleToggleFuncionario,
    isFuncionarioSelected,
    handleConfirm
  };
}
