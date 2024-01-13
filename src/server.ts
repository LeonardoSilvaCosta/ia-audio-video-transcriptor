import dotenv from 'dotenv';
dotenv.config(); import app from './app';
import OpenAI from 'openai';
import { promises as fsPromises } from 'fs'
import fs from 'fs';
const path = require('path');

import ffmpeg, { ffprobe } from 'fluent-ffmpeg'
import ffprobeStatic from 'ffprobe-static';
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);

import { improveTranscription } from './commands';
import { cognitiveConceptualizationCommand } from './commands/supervision';
import { text } from 'express';
import { CSDAnalysisCommand } from './commands/ux';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.ORGANIZATION_ID
});

const chatGptModels = ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-4-1106-preview']
let gptTurbo = 0, gtpTurbo16k = 1, gpt4 = 2;
const chatModel = chatGptModels[gtpTurbo16k];

async function getMediaDuration(videoPath: string): Promise<number> {
  const ffprobeData = await new Promise<string>((resolve, reject) => {
    ffprobe(videoPath, (err, data) => {
      if (err) reject(err);
      else resolve(JSON.stringify(data));
    });
  });

  const ffprobeInfo = JSON.parse(ffprobeData);
  const durationInSeconds = ffprobeInfo.format.duration;
  return durationInSeconds;
}

async function cutFile(videoPath: string, filename: string, outputDir: string) {
  console.log('Cortando arquivo em partes de 10 minutos...')
  const dezMinutos = 10 * 60;

  let totalVideoDuration = await getMediaDuration(videoPath);
  let chunkCounter = 1;
  let exportedFiles = [];

  const splitedFilename = filename.split('.');
  const ext = splitedFilename[splitedFilename.length - 1];

  let startTime = 0;
  let endTime = dezMinutos;

  while (startTime < totalVideoDuration) {
    const chunkPath = `${outputDir}/${splitedFilename[0]}-${chunkCounter}.${ext}`;

    const command = ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(dezMinutos)
      .output(chunkPath);

    const runPromise = new Promise((resolve, reject) => {
      command.on('end', resolve).on('error', reject).run();
    });

    await runPromise;

    exportedFiles.push(chunkPath)

    startTime += dezMinutos;
    endTime += dezMinutos;
    chunkCounter += 1;
  }

  console.log('Ações de corte concluídas.');
  return exportedFiles;
}

function splitText(text: string, textMaxSize: number) {
  const chunks = [];
  for (let i = 0; i < text.length; i += textMaxSize) {
    chunks.push(text.slice(i, i + textMaxSize));
  }
  return chunks;
}



async function audioTranscriptor(cutedAudiosPath: string[], filename: string, outputDir: string) {
  console.log('Transcrevendo audio...');

  let transcriptionsList = [];

  const splitedFilename = filename.split('.');
  const ext = splitedFilename[splitedFilename.length - 1];

  for (const audioPath of cutedAudiosPath) {
    const videoToTranscript = fs.createReadStream(audioPath);

    const transcriptionChunk = await openai.audio.transcriptions.create({
      file: videoToTranscript,
      model: 'whisper-1'
    })

    transcriptionsList.push(transcriptionChunk.text);
  }

  const fullTranscription = transcriptionsList.join('\n\n');
  const outputFile = `${outputDir}/transcrição-${splitedFilename[0]}.${ext}`

  console.log('Transcrição concluída!')

  try {
    await fsPromises.writeFile(outputFile, String(fullTranscription))
    console.log(`O arquivo da transcrição foi armazenado no caminho ${outputDir}`);
  } catch (err) {
    console.error('Erro ao escrever no arquivo', err);
  }

  return outputFile;
}

async function improveTranscriptionWithGpt(transcriptedAudioPath: string, filename: string, roles: string[], outputDir: string) {
  console.log('Melhorando transcrição com chat GPT...');

  let improvedTranscriptionChunksList = [];

  const splitedFilename = filename.split('.');
  const ext = splitedFilename[splitedFilename.length - 1];

  try {
    const transcriptionText = fs.readFileSync(transcriptedAudioPath, 'utf8');

    const transcriptionChunks = splitText(transcriptionText, 10000);

    for (const chunk of transcriptionChunks) {
      const systemCommand = improveTranscription(roles[0], roles[1]);
      const improvedTranscription = await openai.chat.completions.create({
        model: chatModel,
        messages: [
          {
            role: 'system',
            content: systemCommand
          }, {
            role: 'user',
            content: chunk
          }
        ]
      })

      improvedTranscriptionChunksList.push(improvedTranscription.choices[0].message.content);
    }

    const fullImprovedTranscription = improvedTranscriptionChunksList.join('\n');
    const outputFile = `${outputDir}/transcrição-processada-${splitedFilename[0]}.${ext}`

    console.log('Melhoramento de transcrição concluído!');

    try {
      await fsPromises.writeFile(outputFile, String(fullImprovedTranscription))
      console.log(`O arquivo da transcrição melhorada foi armazenado no caminho ${outputDir}`);
    } catch (err) {
      console.error('Erro ao escrever no arquivo', err);
    }

    return outputFile;
  } catch (err) {
    console.log(err)
    return 'Error ao gerar transcrição melhorada.'
  }
}

async function applyAnalysis(improvedTranscriptionPath: string, filename: string, analysisCommand: string, outputDir: string) {
  console.log('Analisando transcrição...');

  try {
    const improvedtranscriptionText = fs.readFileSync(improvedTranscriptionPath, 'utf8');

    const splitedFilename = filename.split('.');
    const ext = splitedFilename[splitedFilename.length - 1];

    const analysis = await openai.chat.completions.create({
      model: chatModel,
      messages: [
        {
          role: 'system',
          content: analysisCommand
        }, {
          role: 'user',
          content: improvedtranscriptionText
        }
      ]
    })

    console.log('Análise concluída.')

    const outputFile = `${outputDir}/análise-${splitedFilename[0]}.${ext}`

    try {
      await fsPromises.writeFile(outputFile, String(analysis.choices[0].message.content))
      console.log(`O arquivo com a análise foi armazenado no caminho ${outputDir}`);
    } catch (err) {
      console.error('Erro ao escrever no arquivo', err);
    }

    return 'Processo finalizado com sucesso!'

  } catch (err) {
    return 'Falha ao gerar arquivo de análise.'
  }
}

async function main() {
  const context = 'interview';
  const commands = {
    cognitiveConceptualizationCommand,
    CSDAnalysisCommand
  }
  const audioFilePath = `public/${context}/original-files/entrevista-paciente-6.mp4`;
  const roles = ['Entrevistador', 'Entrevistado'];
  const analisysCommand = commands.CSDAnalysisCommand;

  const cutedFilesDestination = `public/${context}/file-cuts`;
  const transcriptedAudioDestination = `public/${context}/transcriptions`;
  const improvedTranscriptionsDestination = `public/${context}/improved-transcriptions`;
  const analisedTranscriptionDestination = `public/${context}/analysis`;

  try {
    const audioFilename = `${audioFilePath.split('/')[3].split('.')[0]}.mp3`;

    const cutedAudios = await cutFile(
      audioFilePath,
      audioFilename,
      cutedFilesDestination
    );

    try {
      const textFilename = `${audioFilename.split('.')[0]}.txt`;

      const audioTranscription = await audioTranscriptor(cutedAudios, textFilename, transcriptedAudioDestination);

      const improvedAudioTranscription = await improveTranscriptionWithGpt(audioTranscription, textFilename, roles, improvedTranscriptionsDestination);

      const analysisMessage = await applyAnalysis(improvedAudioTranscription, textFilename, analisysCommand, analisedTranscriptionDestination);

      console.log(analysisMessage)

    } catch (transcriptionError) {
      console.error('Erro durante a transcrição:', transcriptionError);
    }
  } catch (cutError) {
    console.error('Erro ao cortar vídeo:', cutError);
  }
}

main();

const PORT = parseInt(`${process.env.PORT || 3344}`);

app.listen(PORT);
