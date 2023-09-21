import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  OllamaReturnObj,
  allomaGenerate,
  convertTextToJson,
  core,
  extractTextAndCodeBlocks,
  ollamaRequest,
} from '@/core';

import dayjs from 'dayjs';
import { SideInfoSheet } from './parts/SideInfoSheet';
import { useSimple } from 'simple-core-state';
import CodeEditor from '@uiw/react-textarea-code-editor';

import { ReloadIcon, TrashIcon } from '@radix-ui/react-icons';
import { SelectConversation } from './parts/SelectConversation';
import { SelectModel } from './parts/SelectModel';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ConfirmChatClear } from './parts/ConfirmChatClear';
import { ModeToggle } from '@/components/mode-toggle';
import { IntroCard } from './parts/IntroCard';
import { Badge } from '@/components/ui/badge';

const HomePage: React.FC = () => {
  const { toast } = useToast();
  const chatRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLInputElement>(null);

  const model = useSimple(core.model);
  const visited = useSimple(core.visited);
  const API_URL = useSimple(core.localAPI);
  const ollamaConnected = useSimple(core.server_connected);
  const conversations = useSimple(core.conversations);
  const currentConversation = useSimple(core.current_conversation);

  const [showIntroCard, setShowIntroCard] = useState(false);
  const [showChatClearDialog, setShowChatClearDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [txt, setTxt] = useState('');

  const checkIsRunning = async () => {
    try {
      await ollamaRequest('GET', '');
      core.server_connected.set(true);
    } catch (error) {
      core.server_connected.set(false);
      throw error;
    }
  };
  const getAvailableModels = async () => {
    try {
      await checkIsRunning();
      const res = await ollamaRequest('GET', 'api/tags');
      if (res?.data?.models) {
        toast({
          variant: 'default',
          color: 'green',
          title: 'Connected',
          description: 'Connection has been established',
        });
        core.installed_models.set(res.data.models);
      } else {
        toast({
          variant: 'destructive',
          title: 'Failed',
          description: 'No models has been found',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed',
        description:
          'Your ollama is not running, please start your ollama server and refresh the page',
      });
    }
  };

  const removeConv = useCallback(() => {
    setShowChatClearDialog(true);
  }, []);

  const submitPrompt = useCallback(async () => {
    try {
      setLoading(true);

      // Push my question to the history
      const ch = conversations[currentConversation].chatHistory;
      ch.push({
        created_at: new Date(),
        txt: [{ content: txt, type: 'text' }],
        who: 'me',
      });

      core.conversations.updatePiece(currentConversation, {
        ...conversations[currentConversation],
        chatHistory: ch,
      });

      setTxt('');

      // request the prompt
      const res = await allomaGenerate(
        txt,
        model,
        conversations[currentConversation].ctx
      );

      // We neet to convert the NDJSOn to json format
      const convertedToJson: OllamaReturnObj[] = convertTextToJson(res);

      // we need to convert our data set into one string
      const txtMsg = convertedToJson.map((item) => item.response).join('');

      const currentHistory = [
        ...conversations[currentConversation].chatHistory,
      ];

      // TODO: Make function that converts a piece of string into data blocks of types of text we show, so like code or a ordered list and etc...
      if (txtMsg.includes('```')) {
        const codeBlocks = extractTextAndCodeBlocks(txtMsg);
        if (!codeBlocks) {
        } else {
          currentHistory.push({
            created_at: new Date(),
            txt: codeBlocks,
            who: 'ollama',
          });
        }
      } else {
        currentHistory.push({
          txt: [{ content: txtMsg, type: 'text' }],
          who: 'ollama',
          created_at: new Date(),
        });
      }

      if (chatRef.current) {
        chatRef.current.scrollTo(0, chatRef.current.scrollHeight * 2);
      }

      setLoading(false);
      core.conversations.updatePiece(currentConversation, {
        model: model,
        chatHistory: currentHistory,
        ctx: convertedToJson[convertedToJson.length - 1].context,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed',
        description:
          'Something went wrong sending the promt, Check Info & Help',
      });

      setLoading(false);
    }

    // After its done, we need to auto focus since we disable the input whole its processing the request.
    if (promptRef?.current !== null) {
      setTimeout(() => {
        promptRef.current?.focus();
      }, 0);
    }
  }, [txt, chatRef, promptRef, model, conversations, currentConversation]);

  const initPageLoad = () => {
    if (visited === false) {
      setShowIntroCard(true);
    } else {
      getAvailableModels();
    }
  };

  const deleteConversation = useCallback(() => {
    // shallow copy
    const cc = { ...conversations };

    // Don't delete the session object but clear instead
    if (currentConversation === 'session') {
      cc['session'] = {
        chatHistory: [],
        ctx: [],
        model: model,
      };
    } else {
      // all other conversations will be removed
      delete cc[currentConversation];
    }

    // Update the core
    core.conversations.set(cc);

    // Select a new conversation
    const nextId = Object.entries(cc)[0][0] || 'session';
    core.current_conversation.set(nextId);
  }, [currentConversation, conversations, model]);

  useEffect(() => {
    getAvailableModels();
  }, [API_URL]);

  useEffect(() => {
    initPageLoad();
  }, []);

  return (
    <div className="dark:bg-black h-full w-full flex flex-col justify-center items-center">
      {showIntroCard && (
        <IntroCard
          onClose={(e) => {
            if (e) core.visited.set(true);
            setShowIntroCard(false);
          }}
        />
      )}
      {showChatClearDialog && (
        <ConfirmChatClear
          onClose={(e) => {
            setShowChatClearDialog(false);
            if (e) {
              deleteConversation();
            }
          }}
        />
      )}

      <div className="flex flex-col w-full">
        <div className="flex justify-center">
          {ollamaConnected && (
            <Badge
              className="bg-green-200 hover:bg-green-200 text-green-700"
              variant="secondary"
            >
              Connected
            </Badge>
          )}
        </div>
        <div className="flex flex-row mb-2 w-full p-4 pt-2">
          <Input
            ref={promptRef}
            autoFocus
            value={txt}
            disabled={loading}
            placeholder="Prompt"
            className="mr-2 dark:text-zinc-300  outline-none hold:outline-none"
            onChange={(e) => setTxt(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                submitPrompt();
              }
            }}
          />
          <Button
            disabled={loading}
            onClick={() => submitPrompt()}
            className="flex-shrink-0"
          >
            {loading && <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />}
            Submit
          </Button>

          <SelectConversation loading={loading} />
          <Tooltip>
            <TooltipTrigger className="">
              <Button
                disabled={loading}
                size="default"
                className="w-10 p-0 px-2 ml-2 bg-red-400 hover:bg-red-400 dark:bg-red-500 dark:hover:bg-red-500 dark:text-white hover:opacity-60"
                onClick={removeConv}
              >
                <TrashIcon height={21} width={21} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Delete Conversation</p>
            </TooltipContent>
          </Tooltip>

          <SelectModel loading={loading} />
          <SideInfoSheet loading={loading} />
          <ModeToggle />
        </div>
      </div>
      <div className="h-full w-full flex flex-row overflow-hidden">
        <div ref={chatRef} className="w-full overflow-y-scroll px-4">
          {conversations[currentConversation]?.chatHistory?.map(
            (item, index) => (
              <div
                key={index}
                className={` relative w-full flex ${
                  item.who === 'ollama' ? 'justify-end' : ''
                }`}
              >
                {item.who === 'me' && (
                  <p className="mr-2 mt-2.5 text-neutral-400">You</p>
                )}
                <div
                  className={`right-0 flex flex-col mb-10 bg-zinc-100 dark:bg-zinc-900 border-solid border-neutral-200 dark:border-neutral-800  border rounded-xl p-2 w-[80%]`}
                >
                  {item.txt?.map((txtItem, txtIndex) => {
                    if (txtItem.type === 'text') {
                      return (
                        <p
                          key={txtIndex}
                          className="text-left text-neutral-700 dark:text-neutral-300"
                        >
                          {txtItem.content}
                        </p>
                      );
                    } else if (txtItem.type === 'code') {
                      return (
                        <CodeEditor
                          disabled={true}
                          contentEditable={false}
                          key={txtIndex}
                          className="bg-neutral-800 dark:bg-black rounded-md my-2"
                          language="javascript"
                          value={txtItem.content}
                          data-color-mode="dark"
                          style={{
                            fontSize: 12,
                            fontFamily:
                              'ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace',
                          }}
                        />
                      );
                    }
                  })}

                  <p className="absolute bottom-[20px] text-xs text-neutral-500">
                    {dayjs(item.created_at).format('HH:MM:ss')}
                  </p>
                </div>
                {item.who === 'ollama' && (
                  <p className="ml-2 mt-2.5 text-neutral-400">Ollama</p>
                )}
              </div>
            )
          )}
          {loading && (
            <Skeleton className="w-full h-[20px] rounded-full mt-2" />
          )}
          {conversations[currentConversation].chatHistory?.length === 0 &&
            !loading && (
              <p className="text-neutral-400 dark:text-neutral-600 text-center mt-10">
                No message
              </p>
            )}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
