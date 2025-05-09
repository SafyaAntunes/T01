
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AtribuirMultiplosFuncionariosDialog } from "@/components/funcionarios/AtribuirMultiplosFuncionariosDialog";
import { AtribuirFuncionarioDialog } from "@/components/funcionarios/AtribuirFuncionarioDialog";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, X } from "lucide-react";
import { obterFuncionariosAtribuidos } from "@/services/funcionarioEmServicoService";
import { EtapaOS, TipoServico } from "@/types/ordens";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FuncionarioAtribuido {
  id: string;
  nome: string;
  inicio: Date;
}

interface FuncionarioSelectorProps {
  ordemId: string;
  etapa: EtapaOS;
  servicoTipo?: TipoServico;
  funcionarioSelecionadoId?: string;
  funcionariosOptions: any[];
  isEtapaConcluida: boolean;
  onFuncionarioChange: (id: string) => void;
  onSaveResponsavel: (ids: string[], nomes: string[]) => Promise<void>;
  isMultiplosFuncionarios?: boolean;
  isSaving?: boolean;
}

// Using named export instead of default export
export function FuncionarioSelector({
  ordemId,
  etapa,
  servicoTipo,
  funcionarioSelecionadoId,
  funcionariosOptions,
  isEtapaConcluida,
  onFuncionarioChange,
  onSaveResponsavel,
  isMultiplosFuncionarios = true,
  isSaving = false
}: FuncionarioSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [funcionariosAtribuidos, setFuncionariosAtribuidos] = useState<FuncionarioAtribuido[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Debug logs
  console.log("EtapaFuncionarioSelector - render", { 
    funcionarioSelecionadoId, 
    funcionariosAtribuidos: funcionariosAtribuidos.map(f => f.id)
  });

  // Buscar funcionários atribuídos quando o componente for montado
  useEffect(() => {
    const buscarFuncionariosAtribuidos = async () => {
      if (!ordemId) return;
      
      setIsLoading(true);
      try {
        const funcionarios = await obterFuncionariosAtribuidos(ordemId, etapa, servicoTipo);
        console.log("Funcionários atribuídos recebidos:", funcionarios);
        setFuncionariosAtribuidos(funcionarios);
      } catch (error) {
        console.error("Erro ao buscar funcionários atribuídos:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    buscarFuncionariosAtribuidos();
  }, [ordemId, etapa, servicoTipo]);

  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  const handleConfirmAtribuicao = async (ids: string[], nomes: string[]) => {
    console.log("Confirmando atribuição:", ids, nomes);
    await onSaveResponsavel(ids, nomes);
    
    // Atualizar a lista local com os novos funcionários
    const novosFuncionarios = ids.map((id, index) => ({
      id,
      nome: nomes[index] || id,
      inicio: new Date()
    }));
    
    setFuncionariosAtribuidos(novosFuncionarios);
  };

  const handleRemoverFuncionario = async (funcionarioId: string) => {
    // Filtra o funcionário a ser removido
    const funcionariosRestantes = funcionariosAtribuidos.filter(f => f.id !== funcionarioId);
    const ids = funcionariosRestantes.map(f => f.id);
    const nomes = funcionariosRestantes.map(f => f.nome);
    
    await onSaveResponsavel(ids, nomes);
    setFuncionariosAtribuidos(funcionariosRestantes);
  };

  if (isEtapaConcluida) {
    return null;
  }

  return (
    <div className="mt-3 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Funcionários Responsáveis:</h4>
        <Button 
          variant="outline" 
          size="sm"
          className="flex items-center gap-1.5"
          onClick={handleOpenDialog}
          disabled={isSaving}
        >
          <UserPlus className="h-3.5 w-3.5" />
          {funcionariosAtribuidos.length === 0 ? "Atribuir Funcionários" : "Gerenciar Funcionários"}
        </Button>
      </div>
      
      {isLoading ? (
        <div className="py-2 flex items-center space-x-2">
          <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin"></div>
          <span className="text-sm text-muted-foreground">Carregando funcionários...</span>
        </div>
      ) : funcionariosAtribuidos.length > 0 ? (
        <div className="border rounded-lg p-3 bg-muted/30">
          <div className="flex gap-1.5 items-center mb-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {funcionariosAtribuidos.length} funcionário{funcionariosAtribuidos.length > 1 ? 's' : ''} atribuído{funcionariosAtribuidos.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {funcionariosAtribuidos.map(funcionario => (
              <div key={funcionario.id} className="flex justify-between items-center p-2 bg-background rounded border">
                <div>
                  <div className="font-medium">{funcionario.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    Desde: {format(new Date(funcionario.inicio), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoverFuncionario(funcionario.id)}
                  disabled={isSaving}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center border border-dashed rounded-lg p-6 bg-muted/10">
          <div className="text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum funcionário atribuído</p>
            <p className="text-xs mt-1">Clique em "Atribuir Funcionários" para começar</p>
          </div>
        </div>
      )}
      
      {isMultiplosFuncionarios ? (
        <AtribuirMultiplosFuncionariosDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onConfirm={handleConfirmAtribuicao}
          funcionariosSelecionadosIds={funcionariosAtribuidos.map(f => f.id)}
          especialidadeRequerida={servicoTipo}
          title="Gerenciar Funcionários"
          description="Selecione os funcionários que estarão responsáveis por esta etapa."
          confirmLabel="Confirmar Atribuição"
          apenasDisponiveis={false}
        />
      ) : (
        <AtribuirFuncionarioDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onConfirm={(id, nome) => handleConfirmAtribuicao([id], [nome])}
          funcionarioAtualId={funcionarioSelecionadoId}
          especialidadeRequerida={servicoTipo}
          title="Atribuir Funcionário"
          description="Selecione o funcionário responsável por esta etapa."
          confirmLabel="Confirmar Atribuição"
          apenasDisponiveis={false}
        />
      )}
    </div>
  );
}
