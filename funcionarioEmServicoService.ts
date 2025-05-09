import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc, setDoc, collection, query, where, getDocs, arrayUnion, arrayRemove, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { EtapaOS, TipoServico } from '@/types/ordens';

// Cache para documentos do Firestore - com controle de expiração individual
const documentCache: Record<string, {data: any, timestamp: number}> = {};
const CACHE_TTL = 10000; // 10 segundos de TTL para o cache

// Objeto para armazenar timestamps de notificações para evitar duplicatas
const notificationTimestamps: Record<string, number> = {};

// Intervalo mínimo entre notificações do mesmo tipo (em ms)
const NOTIFICATION_COOLDOWN = 3000; 

/**
 * Função para verificar se uma notificação pode ser mostrada
 * @param message Mensagem da notificação
 * @param cooldownMs Tempo mínimo entre notificações do mesmo tipo
 * @returns true se a notificação puder ser mostrada
 */
const shouldShowNotification = (message: string, cooldownMs = NOTIFICATION_COOLDOWN): boolean => {
  const now = Date.now();
  const lastShown = notificationTimestamps[message] || 0;
  
  if (now - lastShown > cooldownMs) {
    notificationTimestamps[message] = now;
    return true;
  }
  
  return false;
};

/**
 * Função otimizada para obter documentos com cache
 * @param collectionName Nome da coleção
 * @param docId ID do documento
 * @returns Objeto com dados do documento e flag indicando se veio do cache
 */
async function getDocumentWithCache(collectionName: string, docId: string) {
  const cacheKey = `${collectionName}/${docId}`;
  const now = Date.now();
  const cachedDoc = documentCache[cacheKey];
  
  // Se temos no cache e não expirou, usar o cache
  if (cachedDoc && (now - cachedDoc.timestamp < CACHE_TTL)) {
    return { data: cachedDoc.data, fromCache: true };
  }
  
  // Se não temos no cache ou expirou, buscar do Firestore
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      documentCache[cacheKey] = { data, timestamp: now };
      return { data, fromCache: false };
    }
  } catch (error) {
    console.error(`Error fetching document ${collectionName}/${docId}:`, error);
  }
  
  return { data: null, fromCache: false };
}

/**
 * Limpa entradas específicas ou todas do cache
 * @param key Chave específica para limpar ou undefined para limpar tudo
 */
export function clearDocumentCache(key?: string) {
  if (key) {
    delete documentCache[key];
  } else {
    Object.keys(documentCache).forEach(k => delete documentCache[k]);
  }
}

// Tipo de registro de serviço
interface ServicoRegistro {
  ordemId: string;
  etapa: EtapaOS;
  servicoTipo?: TipoServico;
  inicio: Date;
  fim?: Date;
}

/**
 * Marca um funcionário como "em serviço" e registra a atividade que ele está realizando
 */
export async function marcarFuncionarioEmServico(
  funcionarioId: string, 
  ordemId: string, 
  etapa: EtapaOS, 
  servicoTipo?: TipoServico
): Promise<boolean> {
  try {
    // Verificação de parâmetros obrigatórios
    if (!funcionarioId || !ordemId || !etapa) {
      console.error('Parâmetros obrigatórios faltando em marcarFuncionarioEmServico');
      return false;
    }

    // Determinar a chave da etapa com base no tipo de serviço
    const etapaKey = ((etapa === 'inspecao_inicial' || etapa === 'inspecao_final' || etapa === 'lavagem') && servicoTipo)
      ? `${etapa}_${servicoTipo}`
      : etapa;
    
    console.log(`Marcando funcionário ${funcionarioId} em serviço para etapa ${etapaKey}`);
    
    // Obter dados do funcionário usando cache
    const { data: funcionarioData, fromCache: isFuncionarioFromCache } = 
      await getDocumentWithCache("funcionarios", funcionarioId);
    
    if (!funcionarioData) {
      if (shouldShowNotification("Funcionário não encontrado")) {
        toast.error("Funcionário não encontrado");
      }
      return false;
    }
    
    // Usar batch para otimizar múltiplas escritas
    const batch = writeBatch(db);
    
    // Atualizar último serviço do funcionário e marcar como ocupado
    const funcionarioRef = doc(db, "funcionarios", funcionarioId);
    batch.update(funcionarioRef, {
      em_servico: true,
      ultima_atividade: {
        ordemId: ordemId,
        etapa: etapa,
        servicoTipo: servicoTipo || null,
        data: new Date()
      }
    });
    
    // Obter dados da ordem usando cache
    const { data: ordemData, fromCache: isOrdemFromCache } = 
      await getDocumentWithCache("ordens_servico", ordemId);
    
    if (!ordemData) {
      if (shouldShowNotification("Ordem de serviço não encontrada")) {
        toast.error("Ordem de serviço não encontrada");
      }
      return false;
    }
    
    // Verificar se já existe informação sobre esta etapa
    const etapaPath = `etapasAndamento.${etapaKey}`;
    const etapaData = ordemData.etapasAndamento?.[etapaKey] || {};
    
    // Preparar dados da etapa
    const etapaUpdate = {
      funcionarioId: funcionarioId,
      funcionarioNome: funcionarioData.nome || "",
      iniciado: new Date(),
      concluido: false,
      finalizado: null,
      servicoTipo: servicoTipo || null,
      status: "em_andamento"
    };
    
    // Atualizar a etapa na ordem
    const ordemRef = doc(db, "ordens_servico", ordemId);
    batch.update(ordemRef, {
      [etapaPath]: etapaUpdate
    });
    
    // Criar registro de serviço
    const registrosRef = collection(db, 'registros_servico');
    const novoRegistro = {
      funcionarioId,
      ordemId,
      etapa,
      servicoTipo: servicoTipo || null,
      inicio: new Date(),
      fim: null
    };
    
    const registroRef = doc(registrosRef);
    batch.set(registroRef, novoRegistro);
    
    // Executar todas as atualizações em uma única transação
    await batch.commit();
    
    return true;
  } catch (error) {
    console.error('Erro ao marcar funcionário em serviço:', error);
    toast.error('Erro ao atualizar status do funcionário');
    return false;
  }
}

/**
 * Marca vários funcionários como "em serviço" para uma mesma etapa
 */
export async function marcarVariosFuncionariosEmServico(
  funcionariosIds: string[],
  ordemId: string,
  etapa: EtapaOS,
  servicoTipo?: TipoServico
): Promise<boolean> {
  try {
    // Verificar se há funcionários para atribuir
    if (!funcionariosIds.length) {
      console.error('Nenhum funcionário para atribuir');
      return false;
    }

    // Usar batch para otimizar múltiplas escritas no Firestore
    if (funcionariosIds.length > 1) {
      const batch = writeBatch(db);
      
      // Determinar a chave da etapa
      const etapaKey = ((etapa === 'inspecao_inicial' || etapa === 'inspecao_final' || etapa === 'lavagem') && servicoTipo)
        ? `${etapa}_${servicoTipo}`
        : etapa;
      
      // Obter dados da ordem
      const { data: ordemData } = await getDocumentWithCache("ordens_servico", ordemId);
      
      if (!ordemData) {
        toast.error("Ordem de serviço não encontrada");
        return false;
      }
      
      const funcionariosPromises = funcionariosIds.map(async (id) => {
        const { data: funcionarioData } = await getDocumentWithCache("funcionarios", id);
        if (funcionarioData) {
          const funcionarioRef = doc(db, "funcionarios", id);
          batch.update(funcionarioRef, {
            ultima_atividade: {
              ordemId,
              etapa,
              servicoTipo: servicoTipo || null,
              data: new Date()
            }
          });
          
          return {
            id,
            nome: funcionarioData.nome || "",
            inicio: new Date()
          };
        }
        return null;
      });
      
      const funcionariosData = (await Promise.all(funcionariosPromises)).filter(Boolean);
      
      if (funcionariosData.length > 0) {
        const ordemRef = doc(db, "ordens_servico", ordemId);
        
        // Atualizar a lista de funcionários da etapa
        batch.update(ordemRef, {
          [`etapasAndamento.${etapaKey}.funcionarios`]: funcionariosData,
          [`etapasAndamento.${etapaKey}.iniciado`]: new Date()
        });
        
        await batch.commit();
        return true;
      }
      
      return false;
    } else {
      // Se for apenas um funcionário, usar o método simples
      return await marcarFuncionarioEmServico(funcionariosIds[0], ordemId, etapa, servicoTipo);
    }
  } catch (error) {
    console.error('Erro ao marcar vários funcionários em serviço:', error);
    if (shouldShowNotification('Erro ao atribuir múltiplos funcionários')) {
      toast.error('Erro ao atribuir múltiplos funcionários');
    }
    return false;
  }
}

/**
 * Força a liberação de um funcionário, encerrando todas as suas atividades em andamento
 */
export async function forcarLiberacaoFuncionario(funcionarioId: string): Promise<boolean> {
  try {
    // Verificar se o funcionário existe
    const { data: funcionarioData } = await getDocumentWithCache("funcionarios", funcionarioId);
    
    if (!funcionarioData) {
      toast.error('Funcionário não encontrado');
      return false;
    }
    
    // Se o funcionário não tiver atividade atual, não há nada a fazer
    if (!funcionarioData.ultima_atividade || !funcionarioData.ultima_atividade.ordemId) {
      toast.info('Funcionário não possui atividades em andamento');
      return true;
    }
    
    // Obter a última atividade para liberar da ordem
    const ultimaAtividade = funcionarioData.ultima_atividade;
    
    // Liberar o funcionário da atividade
    const liberado = await marcarFuncionarioDisponivel(
      funcionarioId,
      ultimaAtividade.ordemId,
      ultimaAtividade.etapa,
      ultimaAtividade.servicoTipo
    );
    
    if (liberado) {
      toast.success('Funcionário liberado com sucesso');
    }
    
    // Encerrar quaisquer registros de serviço abertos - use batch para otimizar
    const registrosRef = collection(db, 'registros_servico');
    const q = query(
      registrosRef,
      where('funcionarioId', '==', funcionarioId),
      where('fim', '==', null)
    );
    
    const registrosSnapshot = await getDocs(q);
    
    if (!registrosSnapshot.empty) {
      const batch = writeBatch(db);
      registrosSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { fim: new Date() });
      });
      await batch.commit();
    }
    
    // Atualizar o status do funcionário para disponível
    const funcionarioRef = doc(db, "funcionarios", funcionarioId);
    await updateDoc(funcionarioRef, {
      em_servico: false,
      ultima_atividade: {
        ...funcionarioData.ultima_atividade,
        fim: new Date()
      }
    });
    
    return true;
  } catch (error) {
    console.error('Erro ao forçar liberação do funcionário:', error);
    toast.error('Não foi possível liberar o funcionário');
    return false;
  }
}

/**
 * Marca um funcionário como disponível após concluir um serviço
 */
export async function marcarFuncionarioDisponivel(
  funcionarioId: string, 
  ordemId: string, 
  etapa: EtapaOS,
  servicoTipo?: TipoServico
): Promise<boolean> {
  try {
    // Verificação de parâmetros obrigatórios
    if (!funcionarioId || !ordemId || !etapa) {
      console.error('Parâmetros obrigatórios faltando em marcarFuncionarioDisponivel');
      return false;
    }

    console.log(`Marcando funcionário ${funcionarioId} disponível para etapa ${etapa} (serviço: ${servicoTipo || 'nenhum'})`);

    // Verificar se o funcionário existe
    const { data: funcionarioData } = await getDocumentWithCache("funcionarios", funcionarioId);
    
    if (!funcionarioData) {
      toast.error('Funcionário não encontrado');
      return false;
    }
    
    // Usar batch para otimizar múltiplas escritas
    const batch = writeBatch(db);
    
    // Encontrar o registro correspondente para esta atividade
    const registrosRef = collection(db, 'registros_servico');
    
    // Construir a query base
    let q = query(
      registrosRef, 
      where('funcionarioId', '==', funcionarioId),
      where('ordemId', '==', ordemId),
      where('etapa', '==', etapa)
    );
    
    // Se tivermos um servicoTipo, criar uma nova query incluindo esse filtro
    if (servicoTipo) {
      q = query(
        registrosRef,
        where('funcionarioId', '==', funcionarioId),
        where('ordemId', '==', ordemId),
        where('etapa', '==', etapa),
        where('servicoTipo', '==', servicoTipo)
      );
    }
    
    const registrosSnapshot = await getDocs(q);
    
    // Atualizar o registro com data de fim
    registrosSnapshot.forEach((docSnapshot) => {
      const registroRef = doc(db, 'registros_servico', docSnapshot.id);
      batch.update(registroRef, {
        fim: new Date()
      });
    });
    
    // Verificar se o funcionário tem outros serviços ativos
    const outrosServicosQuery = query(
      registrosRef,
      where('funcionarioId', '==', funcionarioId),
      where('fim', '==', null)
    );
    
    const outrosServicosSnapshot = await getDocs(outrosServicosQuery);
    
    // Se não tiver outros serviços ativos, marcar como disponível
    if (outrosServicosSnapshot.empty) {
      const funcionarioRef = doc(db, "funcionarios", funcionarioId);
      batch.update(funcionarioRef, {
        em_servico: false,
        ultima_atividade: {
          ...funcionarioData.ultima_atividade,
          fim: new Date()
        }
      });
    }
    
    // Atualizar o documento da ordem para remover este funcionário da etapa
    const { data: ordemData } = await getDocumentWithCache("ordens_servico", ordemId);
    
    if (ordemData) {
      const etapaKey = servicoTipo ? `${etapa}_${servicoTipo}` : etapa;
      const etapaPath = `etapasAndamento.${etapaKey}`;
      const etapaData = ordemData.etapasAndamento?.[etapaKey] || {};
      
      if (etapaData.funcionarios && Array.isArray(etapaData.funcionarios)) {
        // Remover este funcionário do array de funcionários
        const funcionariosAtualizados = etapaData.funcionarios.filter(
          (f: any) => f.id !== funcionarioId
        );
        
        const ordemRef = doc(db, "ordens_servico", ordemId);
        
        // Atualizar a lista de funcionários
        batch.update(ordemRef, {
          [`${etapaPath}.funcionarios`]: funcionariosAtualizados
        });
        
        // Se não houver mais funcionários trabalhando nesta etapa e não estiver marcada como concluída
        if (funcionariosAtualizados.length === 0 && !etapaData.concluido) {
          // Podemos opcionalmente marcar a etapa como "parada" ou manter um registro que não há funcionários
          batch.update(ordemRef, {
            [`${etapaPath}.status`]: "parada"
          });
        }
      }
    }
    
    // Commit all changes in one batch
    await batch.commit();
    
    return true;
  } catch (error) {
    console.error('Erro ao marcar funcionário como disponível:', error);
    toast.error('Erro ao atualizar status do funcionário');
    return false;
  }
}

/**
 * Obtém a lista de funcionários atribuídos a uma etapa
 */
export async function obterFuncionariosAtribuidos(
  ordemId: string, 
  etapa: EtapaOS,
  servicoTipo?: TipoServico
): Promise<any[]> {
  try {
    // Verificação de parâmetros obrigatórios
    if (!ordemId || !etapa) {
      console.error('Parâmetros obrigatórios faltando em obterFuncionariosAtribuidos');
      return [];
    }

    console.log(`Buscando funcionários atribuídos à etapa ${etapa} ${servicoTipo ? `(${servicoTipo})` : ''}`);

    // Obter dados da ordem usando cache
    const { data: ordemData } = await getDocumentWithCache("ordens_servico", ordemId);
    
    if (!ordemData) {
      console.error("Ordem de serviço não encontrada");
      return [];
    }
    
    // Determinar a chave da etapa
    const etapaKey = servicoTipo ? `${etapa}_${servicoTipo}` : etapa;
    
    // Buscar dados dos funcionários atribuídos a esta etapa
    const etapaData = ordemData.etapasAndamento?.[etapaKey];
    
    if (!etapaData || !etapaData.funcionarios || !Array.isArray(etapaData.funcionarios)) {
      return [];
    }
    
    // Retornar a lista de funcionários com dados formatados corretamente
    return etapaData.funcionarios.map((f: any) => ({
      id: f.id,
      nome: f.nome || "Funcionário",
      inicio: f.inicio?.toDate ? f.inicio.toDate() : new Date(f.inicio)
    }));
  } catch (error) {
    console.error("Erro ao buscar funcionários atribuídos:", error);
    return [];
  }
}
