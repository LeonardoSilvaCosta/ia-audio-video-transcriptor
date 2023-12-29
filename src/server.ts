import dotenv from 'dotenv';
dotenv.config(); import app from './app';
import OpenAI from 'openai';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
const path = require('path');

import ffmpeg, { ffprobe } from 'fluent-ffmpeg'
import ffprobeStatic from 'ffprobe-static';
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);

import { improveTranscription } from './commands';
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
    const chunckName = `${outputDir}/${splitedFilename[0]}-${chunkCounter}.${ext}`;

    const command = ffmpeg(videoPath)
      .setStartTime(startTime)
      .setDuration(dezMinutos)
      .output(chunckName);

    const runPromise = new Promise((resolve, reject) => {
      command.on('end', resolve).on('error', reject).run();
    });

    await runPromise;

    exportedFiles.push(chunckName)

    startTime += dezMinutos;
    endTime += dezMinutos;
    chunkCounter += 1;
  }

  console.log('Corte concluído com sucesso!');
  return exportedFiles;
}


async function audioTranscriptor(cutedAudiosPath: string[], outputDir: string) {
  console.log('Transcrevendo audio...');

  let transcriptionsList = [];
  const splitedAudioPath = cutedAudiosPath[0].split('/');
  const filename = splitedAudioPath[splitedAudioPath.length - 1].split('.')[0];

  for (const audioPath of cutedAudiosPath) {
    const videoToTranscript = fs.createReadStream(audioPath);

    const transcriptionChunk = await openai.audio.transcriptions.create({
      file: videoToTranscript,
      model: 'whisper-1'
    })

    transcriptionsList.push(transcriptionChunk.text);
  }

  const fullTranscription = transcriptionsList.join('');
  const outputFile = path.join(outputDir, `${filename.split('-')[0]}-${uuidv4()}.txt`);

  fs.writeFile(outputFile, String(fullTranscription), (err) => {
    if (err) {
      console.error('Erro ao escrever no arquivo', err);
    } else {
      console.log('Arquivo criado com sucesso!')
    }
  });

  return fullTranscription;
}

async function improveTranscriptionWithGpt(transcriptedAudio: string, roles: string[], outputDir: string) {
  console.log('Melhorando transcrição com chat GPT...');
  const systemCommand = improveTranscription(roles[0], roles[1]);
  const improvedTranscription = await openai.chat.completions.create({
    model: chatModel,
    messages: [
      {
        role: 'system',
        content: systemCommand
      }, {
        role: 'user',
        content: transcriptedAudio
      }
    ]
  })

  console.log('Gerando arquivo txt com transcrição...');

  fs.writeFile(`${outputDir}/transcription${uuidv4()}.txt`, String(improvedTranscription.choices[0].message.content), (err) => {
    if (err) {
      console.error('Erro ao escrever no arquivo', err);
    } else {
      console.log('Arquivo criado com sucesso!')
    }
  });

  return improvedTranscription.choices[0].message.content as string;
}

async function applyAnalysis(transcription: string, analysisCommand: string, outputDir: string) {
  console.log('Analisando transcrição...');
  const systemCommand = analysisCommand;

  const analysis = await openai.chat.completions.create({
    model: chatModel,
    messages: [
      {
        role: 'system',
        content: systemCommand
      }, {
        role: 'user',
        content: transcription
      }
    ]
  })

  console.log('Gerando arquivo txt com análise...');

  fs.writeFile(`${outputDir}/analise${uuidv4()}.txt`, String(analysis.choices[0].message.content), (err) => {
    if (err) {
      console.error('Erro ao escrever no arquivo', err);
    } else {
      console.log('Arquivo criado com sucesso!')
    }
  });

  return 'Arquivo gerado com sucesso! Processo concluído.'
}


async function main() {
  const filePath = 'public/interview/entrevista.mp4';
  const filename = 'entrevista.mp3';
  const cutedFilesDestination = 'public/interview/cuts';
  const transcriptedAudioDestination = 'public/interview/pre-transcriptions';
  const improvedTranscriptionsDestination = 'public/interview/transcriptions';
  const analisedTranscriptionDestination = 'public/interview/analysis';
  const roles = ['Entrevistador', 'Entrevistado'];
  const analisysCommand = CSDAnalysisCommand;
  try {
    const cutedAudios = await cutFile(
      filePath,
      filename,
      cutedFilesDestination
    );


    try {

      const transcriptedAudio = await audioTranscriptor(cutedAudios, transcriptedAudioDestination);

      const improvedTranscription = await improveTranscriptionWithGpt(transcriptedAudio, roles, improvedTranscriptionsDestination);

      await applyAnalysis(improvedTranscription, analisysCommand, analisedTranscriptionDestination);

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
