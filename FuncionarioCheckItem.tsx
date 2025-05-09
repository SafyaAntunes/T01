import { memo, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CircleCheck, Clock, CircleX } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

interface FuncionarioCheckItemProps {
  id: string;
  nome: string;
  status: string;
  especialidades?: string[];
  isChecked: boolean;
  onToggle: (id: string) => void;
}

export const FuncionarioCheckItem = memo(function FuncionarioCheckItem({
  id,
  nome,
  status,
  especialidades,
  isChecked,
  onToggle
}: FuncionarioCheckItemProps) {
  // Memoize o handler de clique para evitar recriações
  const handleToggle = useCallback(() => {
    onToggle(id);
  }, [id, onToggle]);

  return (
    <div 
      className={`flex items-center space-x-2 border p-3 rounded-lg transition-colors ${
        isChecked ? "border-primary bg-primary/5" : ""
      }`}
    >
      <Toggle
        pressed={isChecked}
        onPressedChange={handleToggle}
        size="sm"
        variant={isChecked ? "outline" : "default"}
        className={`h-8 w-8 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground rounded-md`}
      >
        {isChecked && <CircleCheck className="h-4 w-4" />}
      </Toggle>

      <div className="flex-1">
        <div className="flex justify-between cursor-pointer">
          <span className="font-medium">{nome}</span>
          {status === 'disponivel' ? (
            <Badge variant="success" className="flex gap-1 items-center">
              <CircleCheck className="h-3.5 w-3.5" />
              Disponível
            </Badge>
          ) : status === 'ocupado' ? (
            <Badge variant="warning" className="flex gap-1 items-center">
              <Clock className="h-3.5 w-3.5" />
              Ocupado
            </Badge>
          ) : (
            <Badge variant="destructive" className="flex gap-1 items-center">
              <CircleX className="h-3.5 w-3.5" />
              Inativo
            </Badge>
          )}
        </div>
        {especialidades && especialidades.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {especialidades.map(esp => (
              <Badge key={esp} variant="secondary" className="text-xs">
                {esp}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
