# O Mundo do Pai Natal — PWA + Supabase

PWA estática para publicar no GitHub Pages ou Vercel, com página de administração protegida por Supabase Auth.

## 1. Configurar as credenciais públicas
1. No Supabase, abre as definições do projeto e copia o **Project URL**.
2. Copia a chave **publishable** (ou `anon` legada).
3. Abre `supabase-config.js` e substitui:
   - `https://TEU-PROJETO.supabase.co`
   - `COLOCA_A_TUA_CHAVE_PUBLICA_AQUI`
4. Esta é uma chave pública destinada ao browser. Nunca uses `service_role` ou uma chave `secret` neste ficheiro.
5. A chave pública pode ficar no repositório, desde que as políticas RLS sejam aplicadas e testadas.

## 2. Preparar a base de dados e Storage
1. No Supabase, vai a **SQL Editor → New query**.
2. Copia e executa o conteúdo de `supabase/setup.sql`.
3. Confirma as tabelas e os buckets `public-media` e `private-letters`.

## 3. Criar a conta de administrador
1. No Supabase, abre **Authentication → Users** e cria/regista a tua conta.
2. Copia o UUID da conta.
3. No SQL Editor executa, substituindo `UUID-DA-TUA-CONTA`:
   ```sql
   insert into public.profiles (id, display_name, role)
   values ('UUID-DA-TUA-CONTA', 'Administrador', 'admin')
   on conflict (id) do update set role = 'admin';
   ```
4. O painel está em `admin.html`. Inicia sessão com o email e palavra-passe da conta.
5. Não atives registos administrativos públicos nem atribuas o papel admin a contas que não controlas.

## 4. O que permite o painel
- Criar contos e aventuras como rascunho ou publicados.
- Carregar imagens de capa.
- Carregar fotografias e vídeos para o bucket público.
- Criar eventos e colocar o PIN clicando no mapa.
- Guardar as coordenadas e os horários no Supabase.

## 5. Publicar
1. Carrega todos os ficheiros e pastas para a raiz do repositório GitHub.
2. Ativa GitHub Pages ou importa o repositório para a Vercel.
3. Abre `supabase-config.js` e confirma que as credenciais são as do projeto correto.
4. Usa HTTPS; a autenticação e as funcionalidades PWA exigem um contexto seguro.

## Avisos de segurança e limitações
- A página pública inicial continua a conter elementos demonstrativos; a leitura dinâmica dos registos publicados no Supabase ainda precisa de ser integrada.
- O painel de administração utiliza RLS, mas deve ser testado com uma conta admin e outra conta normal antes de produção.
- `public-media` é um bucket público: quem conhece o caminho de um ficheiro pode aceder-lhe mesmo que o registo esteja em rascunho. Só carregar ficheiros aprovados para divulgação pública.
- `private-letters` não está aberto ao público. As políticas de acesso a anexos e o fluxo completo de cartas devem ser revistos antes de recolher dados reais de crianças.
- O formulário de carta da página inicial permanece demonstrativo; não envia cartas para o Supabase.
- As notificações Push reais ainda exigem um serviço de envio no servidor e gestão segura das subscrições.
- Não colocar palavras-passe, tokens secretos ou `service_role` no código nem no GitHub.
